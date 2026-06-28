#!/usr/bin/env node

/**
 * Sample Data Loader for Incident Management Portal
 * This script loads sample incidents into the database for testing
 * 
 * Usage: node load-sample-data.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const sampleIncidents = [
  {
    id: 'INC-001',
    title: 'Database connection timeout during peak hours',
    customer: 'demo',
    project: 'Cloud Infrastructure',
    severity: 'Critical',
    status: 'New',
    engineer: 'Babai Chatterjee',
    description: 'Production DB connections spiking to 1500+, causing cascade failures across auth and reporting services.',
    components: 'Database Cluster, Connection Pool',
    applications: 'Customer Portal, Admin Panel',
    sla_hours: 1,
    area: 'Infra',
    tags: ['database', 'timeout']
  },
  {
    id: 'INC-002',
    title: 'API rate limiting not enforced correctly',
    customer: 'vbc',
    project: 'API Platform',
    severity: 'High',
    status: 'In Progress',
    engineer: 'Rohan Shelar',
    description: 'Third-party API calls bypassing rate limits, causing downstream service degradation.',
    components: 'API Gateway',
    applications: 'Mobile App, Partner Portal',
    sla_hours: 4,
    area: 'Application',
    tags: ['api', 'performance']
  },
  {
    id: 'INC-003',
    title: 'S3 bucket publicly accessible — data exposure risk',
    customer: 'tilebar',
    project: 'Cloud Security',
    severity: 'Critical',
    status: 'In Progress',
    engineer: 'Babai Chatterjee',
    description: 'Security audit flagged three S3 buckets with public read access containing PII data.',
    components: 'S3, IAM',
    applications: 'Data Pipeline',
    sla_hours: 1,
    area: 'Infra',
    tags: ['security', 'storage']
  },
  {
    id: 'INC-004',
    title: 'Memory leak in reporting microservice',
    customer: 'ramatgancityhall',
    project: 'Platform Services',
    severity: 'Medium',
    status: 'Further Investigation',
    engineer: 'Babai Chatterjee',
    description: 'Reporting service memory grows unbounded over 24h periods, requiring manual restart.',
    components: 'Reporting Service',
    applications: 'Reports Module',
    sla_hours: 12,
    area: 'Application',
    tags: ['performance', 'monitoring']
  },
  {
    id: 'INC-005',
    title: 'CPU usage sustained at 98% on app servers',
    customer: 'toridoll',
    project: 'Platform Services',
    severity: 'Critical',
    status: 'In Progress',
    engineer: 'Babai Chatterjee',
    description: 'Runaway process consuming all available CPU. Load balancer failing over constantly.',
    components: 'App Servers, Load Balancer',
    applications: 'Main Application',
    sla_hours: 1,
    area: 'Infra',
    tags: ['performance', 'monitoring']
  }
];

async function loadSampleData() {
  let connection;
  try {
    console.log('🔄 Connecting to MySQL database...');
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'incident_management_db'
    });

    console.log('✅ Connected to database');
    console.log('🔄 Loading sample incidents...\n');

    let successCount = 0;
    let skipCount = 0;

    for (const incident of sampleIncidents) {
      try {
        // Check if incident already exists
        const [existing] = await connection.query(
          'SELECT id FROM incidents WHERE id = ?',
          [incident.id]
        );

        if (existing.length > 0) {
          console.log(`⏭️  Skipping ${incident.id} - already exists`);
          skipCount++;
          continue;
        }

        // Insert incident
        await connection.query(
          `INSERT INTO incidents 
           (id, title, customer, project, severity, status, engineer, description, components, applications, sla_hours, area, created_by) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            incident.id,
            incident.title,
            incident.customer,
            incident.project,
            incident.severity,
            incident.status,
            incident.engineer,
            incident.description,
            incident.components,
            incident.applications,
            incident.sla_hours,
            incident.area
          ]
        );

        // Insert tags
        for (const tag of incident.tags) {
          await connection.query(
            'INSERT INTO incident_tags (incident_id, tag_name) VALUES (?, ?)',
            [incident.id, tag.toLowerCase()]
          );
        }

        // Insert activity
        await connection.query(
          `INSERT INTO incident_comments (incident_id, author, action, detail, type, user_id)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [
            incident.id,
            incident.engineer,
            'created incident',
            `Severity: ${incident.severity} · Customer: ${incident.customer}`,
            'create'
          ]
        );

        console.log(`✅ Loaded ${incident.id} - ${incident.title}`);
        successCount++;
      } catch (err) {
        console.error(`❌ Error loading ${incident.id}: ${err.message}`);
      }
    }

    console.log(`
╔════════════════════════════════════════════════════════╗
║          Sample Data Load Complete!                    ║
╠════════════════════════════════════════════════════════╣
║  ✅ Loaded:  ${successCount} incidents                         ║
║  ⏭️  Skipped: ${skipCount} incidents (already existed)          ║
║  📊 Total:   ${successCount + skipCount} incidents in database                ║
╚════════════════════════════════════════════════════════╝
    `);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run the loader
loadSampleData();
