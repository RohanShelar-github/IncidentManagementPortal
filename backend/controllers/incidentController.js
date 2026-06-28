const pool = require('../config/database');

// Helper function to generate incident ID
const generateIncidentId = async () => {
  const [result] = await pool.query(
    "SELECT SUBSTRING_INDEX(MAX(id), '-', -1) as max_num FROM incidents WHERE id LIKE 'INC-%'"
  );
  const maxNum = result[0]?.max_num ? parseInt(result[0].max_num) : 0;
  return `INC-${String(maxNum + 1).padStart(3, '0')}`;
};

const createIncident = async (req, res) => {
  try {
    const {
      title,
      customer,
      project,
      severity,
      status,
      engineer,
      description,
      components,
      applications,
      sla_hours,
      area,
      tags
    } = req.body;

    // Validation
    if (!title || !severity) {
      return res.status(400).json({
        success: false,
        message: 'Title and severity are required'
      });
    }

    // Generate incident ID
    const incidentId = await generateIncidentId();

    // Insert incident
    await pool.query(
      `INSERT INTO incidents 
       (id, title, customer, project, severity, status, engineer, description, components, applications, sla_hours, area, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        incidentId,
        title,
        customer || null,
        project || null,
        severity,
        status || 'New',
        engineer || null,
        description || null,
        components || null,
        applications || null,
        sla_hours || null,
        area || null,
        req.user.id
      ]
    );

    // Insert tags if provided
    if (tags && Array.isArray(tags)) {
      for (const tag of tags) {
        await pool.query(
          'INSERT INTO incident_tags (incident_id, tag_name) VALUES (?, ?)',
          [incidentId, tag.toLowerCase()]
        );
      }
    }

    // Log activity
    await pool.query(
      `INSERT INTO incident_comments (incident_id, author, action, detail, type, user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        incidentId,
        req.user.name,
        'created incident',
        `Severity: ${severity} · Customer: ${customer}`,
        'create',
        req.user.id
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Incident created successfully',
      data: { id: incidentId }
    });
  } catch (error) {
    console.error('Create incident error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getIncidents = async (req, res) => {
  try {
    const {
      customer,
      area,
      severity,
      status,
      tags,
      search,
      limit = 50,
      offset = 0
    } = req.query;

    let query = 'SELECT * FROM incidents WHERE 1=1';
    const params = [];

    if (customer) {
      query += ' AND customer = ?';
      params.push(customer);
    }

    if (area) {
      query += ' AND area = ?';
      params.push(area);
    }

    if (severity) {
      query += ' AND severity = ?';
      params.push(severity);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (title LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Add pagination
    query += ' ORDER BY date_created DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [incidents] = await pool.query(query, params);

    // For each incident, fetch tags
    for (let incident of incidents) {
      const [tagRows] = await pool.query(
        'SELECT tag_name FROM incident_tags WHERE incident_id = ?',
        [incident.id]
      );
      incident.tags = tagRows.map(t => t.tag_name);
    }

    return res.status(200).json({
      success: true,
      data: incidents
    });
  } catch (error) {
    console.error('Get incidents error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getIncidentById = async (req, res) => {
  try {
    const { id } = req.params;

    const [incidents] = await pool.query('SELECT * FROM incidents WHERE id = ?', [id]);

    if (incidents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    const incident = incidents[0];

    // Fetch tags
    const [tagRows] = await pool.query(
      'SELECT tag_name FROM incident_tags WHERE incident_id = ?',
      [id]
    );
    incident.tags = tagRows.map(t => t.tag_name);

    // Fetch comments
    const [comments] = await pool.query(
      'SELECT * FROM incident_comments WHERE incident_id = ? ORDER BY created_at DESC',
      [id]
    );
    incident.comments = comments;

    return res.status(200).json({
      success: true,
      data: incident
    });
  } catch (error) {
    console.error('Get incident error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const updateIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      customer,
      project,
      severity,
      status,
      engineer,
      description,
      components,
      applications,
      sla_hours,
      area,
      date_created,
      date,
      startDT,
      rca,
      resolution,
      resolved_by,
      sf_case,
      downtime_h,
      downtime_m,
      mttr_h,
      mttr_m,
      tags
    } = req.body;

    // Check if incident exists
    const [incidents] = await pool.query('SELECT * FROM incidents WHERE id = ?', [id]);
    if (incidents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    // Update incident
    const updates = [];
    const values = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (customer !== undefined) {
      updates.push('customer = ?');
      values.push(customer);
    }
    if (project !== undefined) {
      updates.push('project = ?');
      values.push(project);
    }
    if (severity !== undefined) {
      updates.push('severity = ?');
      values.push(severity);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (engineer !== undefined) {
      updates.push('engineer = ?');
      values.push(engineer);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (components !== undefined) {
      updates.push('components = ?');
      values.push(components);
    }
    if (applications !== undefined) {
      updates.push('applications = ?');
      values.push(applications);
    }
    if (sla_hours !== undefined) {
      updates.push('sla_hours = ?');
      values.push(sla_hours);
    }
    if (area !== undefined) {
      updates.push('area = ?');
      values.push(area);
    }
    const dateCreated = date_created || startDT || date;
    if (dateCreated !== undefined) {
      updates.push('date_created = ?');
      values.push(dateCreated ? String(dateCreated).replace('T', ' ').substring(0, 19) : null);
    }
    if (rca !== undefined) {
      updates.push('rca = ?');
      values.push(rca);
    }
    if (resolution !== undefined) {
      updates.push('resolution = ?');
      values.push(resolution);
    }
    if (resolved_by !== undefined) {
      updates.push('resolved_by = ?');
      values.push(resolved_by);
    }
    if (sf_case !== undefined) {
      updates.push('sf_case = ?');
      values.push(sf_case);
    }
    if (downtime_h !== undefined) {
      updates.push('downtime_h = ?');
      values.push(downtime_h);
    }
    if (downtime_m !== undefined) {
      updates.push('downtime_m = ?');
      values.push(downtime_m);
    }
    if (mttr_h !== undefined) {
      updates.push('mttr_h = ?');
      values.push(mttr_h);
    }
    if (mttr_m !== undefined) {
      updates.push('mttr_m = ?');
      values.push(mttr_m);
    }

    if (updates.length > 0) {
      values.push(id);
      await pool.query(
        `UPDATE incidents SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    // Update tags if provided
    if (tags !== undefined) {
      const tagList = Array.isArray(tags) ? tags : [];
      // Delete old tags
      await pool.query('DELETE FROM incident_tags WHERE incident_id = ?', [id]);
      // Insert new tags
      for (const tag of tagList) {
        await pool.query(
          'INSERT INTO incident_tags (incident_id, tag_name) VALUES (?, ?)',
          [id, tag.toLowerCase()]
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Incident updated successfully'
    });
  } catch (error) {
    console.error('Update incident error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const deleteIncident = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if incident exists
    const [incidents] = await pool.query('SELECT * FROM incidents WHERE id = ?', [id]);
    if (incidents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    // Delete incident (tags and comments will cascade delete)
    await pool.query('DELETE FROM incidents WHERE id = ?', [id]);

    return res.status(200).json({
      success: true,
      message: 'Incident deleted successfully'
    });
  } catch (error) {
    console.error('Delete incident error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    // Get total incidents
    const [totalResult] = await pool.query('SELECT COUNT(*) as count FROM incidents');
    const total = totalResult[0].count;

    // Get open incidents
    const [openResult] = await pool.query(
      "SELECT COUNT(*) as count FROM incidents WHERE status != 'Closed'"
    );
    const open = openResult[0].count;

    // Get critical incidents
    const [criticalResult] = await pool.query(
      "SELECT COUNT(*) as count FROM incidents WHERE severity = 'Critical' AND status != 'Closed'"
    );
    const critical = criticalResult[0].count;

    // Get incidents by status
    const [statusBreakdown] = await pool.query(
      'SELECT status, COUNT(*) as count FROM incidents GROUP BY status'
    );

    // Get incidents by severity
    const [severityBreakdown] = await pool.query(
      'SELECT severity, COUNT(*) as count FROM incidents GROUP BY severity'
    );

    // Get incidents by area
    const [areaBreakdown] = await pool.query(
      'SELECT area, COUNT(*) as count FROM incidents WHERE area IS NOT NULL GROUP BY area'
    );

    return res.status(200).json({
      success: true,
      data: {
        total,
        open,
        critical,
        statusBreakdown,
        severityBreakdown,
        areaBreakdown
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment_text, action, detail } = req.body;

    // Check if incident exists
    const [incidents] = await pool.query('SELECT * FROM incidents WHERE id = ?', [id]);
    if (incidents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    // Insert comment
    await pool.query(
      `INSERT INTO incident_comments (incident_id, author, action, detail, comment_text, type, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        req.user.name,
        action || 'commented',
        detail || null,
        comment_text || null,
        'comment',
        req.user.id
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Comment added successfully'
    });
  } catch (error) {
    console.error('Add comment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  createIncident,
  getIncidents,
  getIncidentById,
  updateIncident,
  deleteIncident,
  getDashboardStats,
  addComment
};
