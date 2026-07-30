param(
  [Parameter(Mandatory = $true)]
  [string]$WorkbookPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-ColumnName([string]$reference) {
  return $reference -replace '\d', ''
}

function Read-ZipXml($archive, [string]$entryName) {
  $entry = $archive.GetEntry($entryName)
  if (-not $entry) { throw "Missing XLSX entry: $entryName" }
  $reader = New-Object System.IO.StreamReader($entry.Open())
  try { return [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
}

$resolvedPath = (Resolve-Path -LiteralPath $WorkbookPath).Path
$archive = [System.IO.Compression.ZipFile]::OpenRead($resolvedPath)
try {
  $mainNamespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  $sharedStrings = @()
  $sharedEntry = $archive.GetEntry('xl/sharedStrings.xml')
  if ($sharedEntry) {
    $sharedXml = Read-ZipXml $archive 'xl/sharedStrings.xml'
    $sharedNs = New-Object System.Xml.XmlNamespaceManager($sharedXml.NameTable)
    $sharedNs.AddNamespace('x', $mainNamespace)
    foreach ($item in $sharedXml.SelectNodes('//x:si', $sharedNs)) {
      $sharedStrings += (($item.SelectNodes('.//x:t', $sharedNs) | ForEach-Object { $_.InnerText }) -join '')
    }
  }

  $sheetXml = Read-ZipXml $archive 'xl/worksheets/sheet1.xml'
  $sheetNs = New-Object System.Xml.XmlNamespaceManager($sheetXml.NameTable)
  $sheetNs.AddNamespace('x', $mainNamespace)
  $sheetRows = $sheetXml.SelectNodes('//x:sheetData/x:row', $sheetNs)
  if ($sheetRows.Count -lt 2) { throw 'Workbook does not contain data rows' }

  function Get-CellRawValue($cell) {
    $valueNode = $cell.SelectSingleNode('./x:v', $sheetNs)
    $value = if ($valueNode) { $valueNode.InnerText } else { '' }
    if ($cell.t -eq 's' -and $value -ne '') { return $sharedStrings[[int]$value] }
    if ($cell.t -eq 'inlineStr') {
      $textNode = $cell.SelectSingleNode('.//x:t', $sheetNs)
      return $(if ($textNode) { $textNode.InnerText } else { '' })
    }
    return $value
  }

  $headers = [ordered]@{}
  foreach ($cell in $sheetRows[0].SelectNodes('./x:c', $sheetNs)) {
    $headers[(Get-ColumnName $cell.r)] = Get-CellRawValue $cell
  }

  $dateTimeHeaders = @('Start time ', 'End Time', 'Date/Time Closed', 'Date/Time Opened')
  $dateOnlyHeaders = @('Closed Date')
  $records = @()
  foreach ($row in ($sheetRows | Select-Object -Skip 1)) {
    $rawByColumn = @{}
    foreach ($cell in $row.SelectNodes('./x:c', $sheetNs)) {
      $rawByColumn[(Get-ColumnName $cell.r)] = Get-CellRawValue $cell
    }

    $values = [ordered]@{}
    $excelSerials = [ordered]@{}
    foreach ($column in $headers.Keys) {
      $header = $headers[$column]
      $rawValue = if ($rawByColumn.ContainsKey($column)) { [string]$rawByColumn[$column] } else { '' }
      if ($rawValue -ne '' -and ($dateTimeHeaders -contains $header -or $dateOnlyHeaders -contains $header)) {
        $excelSerials[$header] = $rawValue
        $dateValue = [datetime]::FromOADate([double]::Parse($rawValue, [Globalization.CultureInfo]::InvariantCulture))
        $values[$header] = if ($dateOnlyHeaders -contains $header) {
          $dateValue.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
        } else {
          $dateValue.ToString('yyyy-MM-dd HH:mm:ss', [Globalization.CultureInfo]::InvariantCulture)
        }
      } else {
        $values[$header] = $rawValue
      }
    }
    $records += [pscustomobject]@{
      source_row = [int]$row.r
      values = [pscustomobject]$values
      excel_serials = [pscustomobject]$excelSerials
    }
  }

  [pscustomobject]@{
    workbook = $resolvedPath
    sheet = 'Sheet1'
    row_count = $records.Count
    headers = @($headers.Values)
    records = $records
  } | ConvertTo-Json -Depth 8 -Compress
} finally {
  $archive.Dispose()
}
