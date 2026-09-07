-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: incident_management_db
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Dumping data for table `schema_migrations`
--

LOCK TABLES `schema_migrations` WRITE;
/*!40000 ALTER TABLE `schema_migrations` DISABLE KEYS */;
INSERT INTO `schema_migrations` VALUES ('006_store_incident_comments','2026-07-29 11:59:34'),('010_notification_retention','2026-07-30 15:02:31'),('011_user_activation','2026-08-03 08:50:54'),('012_align_user_roles','2026-08-03 11:19:38'),('013_user_profile_fields','2026-08-04 11:33:40'),('014_database_roles','2026-08-04 15:10:30'),('015_repair_incident_timezone_values','2026-08-05 10:39:25'),('016_mailbox_role_permissions','2026-08-21 10:26:32'),('017_mailbox_delete_permission','2026-08-21 10:56:09'),('018_critical_incident_email_automation','2026-08-23 14:04:28'),('019_customer_critical_email_recipient_configs','2026-08-24 13:56:28'),('020_operations_mail_permission_labels','2026-08-25 07:05:53'),('021_mailbox_notifications_follow_read_status','2026-08-25 12:26:26'),('022_customer_jira_project_codes','2026-08-25 12:57:14'),('023_operations_email_create_incident_audit','2026-08-25 13:36:01'),('025_incident_description_images','2026-08-26 06:41:14'),('026_normalize_legacy_incident_references','2026-08-26 11:02:35'),('027_incident_delete_permission','2026-08-28 05:22:03'),('028_operations_incident_area_defaults','2026-08-30 11:21:19'),('029_user_email_signatures','2026-08-31 12:32:12'),('030_incident_rich_report_images','2026-09-01 07:20:39'),('031_incident_drafts','2026-09-06 12:53:54'),('031_repair_est_to_et_canonical_timestamps','2026-09-03 13:24:26');
/*!40000 ALTER TABLE `schema_migrations` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-07 15:50:34
