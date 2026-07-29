-- Add the two workflow statuses already exposed by the incident user interface.
-- Existing values and the default remain unchanged.
ALTER TABLE incidents
  MODIFY COLUMN status ENUM(
    'open',
    'in_progress',
    'tier_1_level_support',
    'further_investigation',
    'escalated_to_rd',
    'escalated_to_cso_devops',
    'escalated_to_3rd_party',
    'resolved',
    'closed'
  ) DEFAULT 'open';

