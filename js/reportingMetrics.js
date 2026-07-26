(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ReportingMetrics = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizeReportingLabel(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function isHistorianIncident(incident) {
    return normalizeReportingLabel(incident && incident.project) === 'historian';
  }

  function isNgcCustomer(customerName) {
    return normalizeReportingLabel(customerName) === 'ngc';
  }

  function partitionHistorianIncidents(incidentList) {
    return (incidentList || []).reduce(function (result, incident) {
      result[isHistorianIncident(incident) ? 'historian' : 'application'].push(incident);
      return result;
    }, { application: [], historian: [] });
  }

  function getDowntimeMinutes(incident) {
    var hours = Number(incident && (incident.downtimeH ?? incident.downtime_h)) || 0;
    var minutes = Number(incident && (incident.downtimeM ?? incident.downtime_m)) || 0;
    return Math.max(0, hours * 60 + minutes);
  }

  function sumDowntimeMinutes(incidentList) {
    return (incidentList || []).reduce(function (total, incident) {
      return total + getDowntimeMinutes(incident);
    }, 0);
  }

  return {
    normalizeReportingLabel: normalizeReportingLabel,
    isHistorianIncident: isHistorianIncident,
    isNgcCustomer: isNgcCustomer,
    partitionHistorianIncidents: partitionHistorianIncidents,
    getDowntimeMinutes: getDowntimeMinutes,
    sumDowntimeMinutes: sumDowntimeMinutes
  };
}));
