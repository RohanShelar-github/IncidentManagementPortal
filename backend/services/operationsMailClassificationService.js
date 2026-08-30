'use strict';

// Centralized classification for the single Operations Microsoft 365 mailbox.
// Keep source rules here so new providers can be added without changing UI code.
const OPERATIONS_MAIL_CATEGORIES = Object.freeze({
  all: { key: 'all', label: 'All Incoming' },
  coralogix: { key: 'coralogix', label: 'Coralogix Alerts', sender: 'alerts@coralogix.com' },
  azure: { key: 'azure', label: 'Azure Alerts', sender: 'azure-noreply@microsoft.com' },
  jira: { key: 'jira', label: 'Customer Raised Tickets' },
  sent: { key: 'sent', label: 'Sent Items' }
});

function jiraSubjectPrefix() {
  return String(process.env.JIRA_CUSTOMER_TICKET_SUBJECT_PREFIX || 'A new support issue ').trim();
}

function isJiraCustomerTicketSubject(subject) {
  const value = String(subject || '').trim().toLowerCase();
  const prefix = jiraSubjectPrefix().toLowerCase();
  return Boolean(prefix && value.startsWith(prefix) && /\bwas reported by the customer\b/i.test(value));
}

function extractJiraIssueKey(subject) {
  const match = String(subject || '').match(/\b([A-Z][A-Z0-9]+-\d+)\b/i);
  return match ? match[1].toUpperCase() : '';
}

function subjectContains(subject, phrase) {
  const words = String(phrase || '').trim().split(/[\s_-]+/).filter(Boolean);
  if (!words.length) return false;
  // Treat spaces, underscores and hyphens between words as equivalent while
  // keeping word boundaries around the whole phrase (for example, MES must
  // not match "times").
  const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s_-]+');
  return new RegExp(`(^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, 'i').test(String(subject || ''));
}

function operationsIncidentDefaults(category, subject) {
  const source = String(category || '').trim().toLowerCase();
  const selected = (area, productLine, rule) => ({ area, product_line: productLine, severity: null, rule });

  if (source === 'coralogix') {
    if (subjectContains(subject, 'Project')) return selected('Integration', 'Integration', 'coralogix-project');
    if (subjectContains(subject, 'License')) return selected('License', 'Integration', 'coralogix-license');
    if (subjectContains(subject, 'IMM')) return selected('InMemoryMiddleware', 'Integration', 'coralogix-imm');
    if (subjectContains(subject, 'Local Agent')) return selected('Local Agent', 'Integration', 'coralogix-local-agent');
    if (subjectContains(subject, 'Workspace')) return selected('Workspace', 'Integration', 'coralogix-workspace');
    if (subjectContains(subject, 'MCM')) return selected('Magic Cloud Manager', 'Integration', 'coralogix-mcm');
    return selected('Infrastructure', 'Integration', 'coralogix-default');
  }

  if (source === 'azure') {
    if (subjectContains(subject, 'MESInsights') || subjectContains(subject, 'MES')) return selected('NGC - MES', 'Application', 'azure-mes');
    if (subjectContains(subject, 'MDE')) return selected('NGC - MDE', 'Application', 'azure-mde');
    if (subjectContains(subject, 'Historian')) return selected('Historian', 'FactoryEye', 'azure-historian');
    if (subjectContains(subject, 'Redis')) return selected('Redis', 'Application', 'azure-redis');
    if (subjectContains(subject, 'AIML')) return selected('NGC - AIML', 'Application', 'azure-aiml');
    if (subjectContains(subject, 'CPU') || subjectContains(subject, 'Memory') || subjectContains(subject, 'Disk')) return selected('Infrastructure', 'Application', 'azure-resource');
    if (subjectContains(subject, 'Workspace')) return selected('Workspace', 'Integration', 'azure-workspace');
    if (subjectContains(subject, 'Virtual Machine')) return selected('Infrastructure', 'Application', 'azure-virtual-machine');
    if (subjectContains(subject, 'MagicXPI')) return selected('Integration', 'Application', 'azure-magicxpi');
    if (subjectContains(subject, 'XPI_ProjectStatus')) return selected('Local Agent', 'Integration', 'azure-xpi-project-status');
    return selected(null, 'Application', 'azure-default');
  }

  if (source === 'jira') return selected(null, 'Integration', 'customer-ticket');
  return selected(null, null, 'no-source-rule');
}

function classifyOperationsMessage(message) {
  const sender = String(message?.from || message?.fromAddress || '').trim().toLowerCase();
  const subject = String(message?.subject || '');
  if (sender === OPERATIONS_MAIL_CATEGORIES.coralogix.sender) return { category: 'coralogix', jiraIssueKey: '' };
  if (sender === OPERATIONS_MAIL_CATEGORIES.azure.sender) return { category: 'azure', jiraIssueKey: '' };
  if (isJiraCustomerTicketSubject(subject)) return { category: 'jira', jiraIssueKey: extractJiraIssueKey(subject) };
  return { category: 'other', jiraIssueKey: '' };
}

function normalizedOperationsCategory(value) {
  const key = String(value || 'all').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(OPERATIONS_MAIL_CATEGORIES, key) ? key : 'all';
}

module.exports = { OPERATIONS_MAIL_CATEGORIES, classifyOperationsMessage, extractJiraIssueKey, isJiraCustomerTicketSubject, jiraSubjectPrefix, normalizedOperationsCategory, operationsIncidentDefaults, subjectContains };
