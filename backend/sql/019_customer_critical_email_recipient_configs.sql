-- Customer-specific recipient configuration for Critical Incident emails.
-- Recipients are stored as comma-separated addresses and remain editable in the email preview.

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name, 'prachi_palande@magicsoftware.com,cloudopssupport@magicsoftware.com', 'ryan_beck@magicsoftware.com,jkaplan@magicsoftware.com,lhoon@magicsoftware.com,nicole.downing@sugarcrm.com,jdalpezzo@calcoastcu.org,dculham@calcoastcu.org,skalyanapu@calcoastcu.org,its24x7@magicsoftware.com', 1, CURDATE() FROM customers WHERE customer_name = 'CCCU'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name, 'babai_chatterjee@magicsoftware.com,cloudopssupport@magicsoftware.com', 'vhaimov@magicsoftware.com,jkaplan@magicsoftware.com,lhoon@magicsoftware.com,asim_maltare@magicsoftware.com,shubham_mote@magicsoftware.com,ksheer@vbcosmetics.com,jbennett@vbcosmetics.com,bdosi@vbcosmetics.com,its24x7@magicsoftware.com', 1, CURDATE() FROM customers WHERE customer_name = 'VB Cosmetics'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name, 'nikhil_kawade@magicsoftware.com,cloudopssupport@magicsoftware.com', 'vhaimov@magicsoftware.com,renee.dinh@christiedigital.com,sherry.yan@christiedigital.com,ranjit.tulasi@christiedigital.com,lhoon@magicsoftware.com,jkaplan@magicsoftware.com,asim_maltare@magicsoftware.com,its24x7@magicsoftware.com', 1, CURDATE() FROM customers WHERE customer_name = 'Christie Digital'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name, 'babai_chatterjee@magicsoftware.com,cloudopssupport@magicsoftware.com', 'vhaimov@magicsoftware.com,jkaplan@magicsoftware.com,lhoon@magicsoftware.com,kcrathjen@intrado.com,jpyuliat@intrado.com,d365prodsupport@intrado.com,its24x7@magicsoftware.com', 1, CURDATE() FROM customers WHERE customer_name = 'Intrado'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name, 'babai_chatterjee@magicsoftware.com,cloudopssupport@magicsoftware.com', 'ryan_beck@magicsoftware.com,lhoon@magicsoftware.com,jkaplan@magicsoftware.com,soon.van@sugarcrm.com,meredith.christenson@sugarcrm.com,GLB-MSG-IT-SugarConnectAdmin@smc.com,its24x7@magicsoftware.com', 1, CURDATE() FROM customers WHERE customer_name = 'SMC'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name, 'babai_chatterjee@magicsoftware.com,cloudopssupport@magicsoftware.com', 'vhaimov@magicsoftware.com,lhoon@magicsoftware.com,jkaplan@magicsoftware.com,malyeshmerni@tilebar.com,heshy@tilebar.com,gholman@tilebar.com,rradcliffe@tilebar.com,its24x7@magicsoftware.com', 1, CURDATE() FROM customers WHERE customer_name = 'TileBar'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name, 'prachi_palande@magicsoftware.com,cloudopssupport@magicsoftware.com', 'vhaimov@magicsoftware.com,lhoon@magicsoftware.com,jkaplan@magicsoftware.com,asim_maltare@magicsoftware.com,rcastro@bwc.com,its24x7@magicsoftware.com', 1, CURDATE() FROM customers WHERE customer_name = 'BWC'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name, 'prachi_palande@magicsoftware.com,cloudopssupport@magicsoftware.com', 'ryan_beck@magicsoftware.com,lhoon@magicsoftware.com,jkaplan@magicsoftware.com,pchae@shieldsharper.com,jestes@shieldsharper.com,its24x7@magicsoftware.com', 1, CURDATE() FROM customers WHERE customer_name = 'TCP - Shields Harper'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name, 'prachi_palande@magicsoftware.com,cloudopssupport@magicsoftware.com', 'ryan_beck@magicsoftware.com,lhoon@magicsoftware.com,jkaplan@magicsoftware.com,c.sapp@mortonind.com,jegli@mortonind.com,its24x7@magicsoftware.com', 1, CURDATE() FROM customers WHERE customer_name = 'MSE US - Morton Industries'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name, 'prachi_palande@magicsoftware.com,cloudopssupport@magicsoftware.com', 'ryan_beck@magicsoftware.com,lhoon@magicsoftware.com,jkaplan@magicsoftware.com,applicationadmins@achievacu.com,its24x7@magicsoftware.com', 1, CURDATE() FROM customers WHERE customer_name = 'MSE US - Achieva Credit Union'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name, 'prachi_palande@magicsoftware.com,cloudopssupport@magicsoftware.com', 'ryan_beck@magicsoftware.com,jkaplan@magicsoftware.com,lhoon@magicsoftware.com,asim_maltare@magicsoftware.com,nicole.downing@sugarcrm.com,RThach@ivesbank.com,mkeeler@ivesbank.com,its24x7@magicsoftware.com', 1, CURDATE() FROM customers WHERE customer_name = 'Ives Bank'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name, 'prachi_palande@magicsoftware.com,cloudopssupport@magicsoftware.com', 'ryan_beck@magicsoftware.com,rbhojwan@san.org,mvaradar@san.org,syadaval@san.org,its24x7@magicsoftware.com', 1, CURDATE() FROM customers WHERE customer_name = 'San Diego Airport'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name, 'nikhil_kawade@magicsoftware.com,cloudopssupport@magicsoftware.com', 'oliver_hoehn@magicsoftware.com,dmitryb@magicsoftware.com,sherbert@magicsoftware.com,babai_chatterjee@magicsoftware.com,Prettl-EDI@magicsoftware.com,its24x7@magicsoftware.com', 1, CURDATE() FROM customers WHERE customer_name = 'Prettl'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name, 'nikhil_kawade@magicsoftware.com,cloudopssupport@magicsoftware.com', 'sunao_nonaka@magicsoftware.com,msj-toridoll@magicsoftware.com,its24x7@magicsoftware.com', 1, CURDATE() FROM customers WHERE customer_name = 'TORIDOLL'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name, 'prachi_palande@magicsoftware.com,cloudopssupport@magicsoftware.com', 'azthaer@magicsoftware.com,irar@magicsoftware.com,shayz@magicsoftware.com,mayan@magicsoftware.com,its24x7@magicsoftware.com', 1, CURDATE() FROM customers WHERE customer_name = 'Ramat-Gan Municipality'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name, 'Rohan_Shelar@magicsoftware.com,cloudopssupport@magicsoftware.com', 'Regina_Shinde@magicsoftware.com,Mayur_Jaipurkar@magicsoftware.com,its24x7@magicsoftware.com', 1, CURDATE() FROM customers WHERE customer_name = 'MIS Cloud'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

INSERT INTO schema_migrations(version) VALUES ('019_customer_critical_email_recipient_configs') ON DUPLICATE KEY UPDATE applied_at=applied_at;
