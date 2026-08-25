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

module.exports = { OPERATIONS_MAIL_CATEGORIES, classifyOperationsMessage, extractJiraIssueKey, isJiraCustomerTicketSubject, jiraSubjectPrefix, normalizedOperationsCategory };
