CREATE DATABASE  IF NOT EXISTS `incident_management_db` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `incident_management_db`;
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
-- Table structure for table `incidents`
--

DROP TABLE IF EXISTS `incidents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `incidents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `incident_ref` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `legacy_case_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `severity` enum('low','medium','high','critical','normal') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('open','in_progress','tier_1_level_support','further_investigation','escalated_to_rd','escalated_to_cso_devops','escalated_to_3rd_party','resolved','closed') COLLATE utf8mb4_unicode_ci DEFAULT 'open',
  `assigned_to` int DEFAULT NULL,
  `case_owner` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int NOT NULL,
  `customer` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` int DEFAULT NULL,
  `project` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `project_area` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `area` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `area_id` int DEFAULT NULL,
  `product_line` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sla_hours` float DEFAULT NULL,
  `sla_minutes` smallint unsigned DEFAULT NULL,
  `tags` json DEFAULT NULL,
  `comments` json DEFAULT NULL,
  `start_dt` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_time_opened` datetime DEFAULT NULL,
  `opened_at_utc` datetime(6) DEFAULT NULL,
  `end_dt` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_time_closed` datetime DEFAULT NULL,
  `closed_at_utc` datetime(6) DEFAULT NULL,
  `closed_date` date DEFAULT NULL,
  `timezone` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'IST',
  `source_timezone` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `downtime_hours` int DEFAULT '0',
  `downtime_minutes` int DEFAULT '0',
  `downtime_mins` int NOT NULL DEFAULT '0',
  `downtime_str` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rca` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `resolution` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `resolved_by` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sf_case_no` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incident_report_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mttd_str` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mttd_minutes` int DEFAULT NULL,
  `legacy_month` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `internal_status` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rd_tickets` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `legacy_source` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `legacy_raw` json DEFAULT NULL,
  `mttr_str` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mttr_minutes` int unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `incident_ref` (`incident_ref`),
  KEY `assigned_to` (`assigned_to`),
  KEY `created_by` (`created_by`),
  KEY `idx_incidents_status` (`status`),
  KEY `idx_incidents_severity` (`severity`),
  KEY `idx_incidents_customer` (`customer`),
  KEY `idx_incidents_created` (`created_at`),
  KEY `idx_incidents_customer_id` (`customer_id`),
  KEY `idx_incidents_area_id` (`area_id`),
  KEY `idx_incidents_legacy_case_number` (`legacy_case_number`),
  KEY `idx_incidents_case_owner` (`case_owner`),
  KEY `idx_incidents_product_line` (`product_line`),
  KEY `idx_incidents_open_closed` (`date_time_opened`,`date_time_closed`),
  KEY `idx_incidents_reporting` (`customer_id`,`area_id`,`severity`,`status`,`closed_date`),
  KEY `idx_incidents_sf_case_no` (`sf_case_no`),
  KEY `idx_incidents_customer_opened_utc` (`customer_id`,`opened_at_utc`),
  KEY `idx_incidents_status_opened_utc` (`status`,`opened_at_utc`),
  KEY `idx_incidents_closed_at_utc` (`closed_at_utc`),
  KEY `idx_incidents_project_opened_utc` (`project`,`opened_at_utc`),
  CONSTRAINT `fk_incidents_area_id` FOREIGN KEY (`area_id`) REFERENCES `area` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_incidents_customer_id` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `incidents_ibfk_1` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `incidents_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_incidents_downtime_nonnegative` CHECK ((`downtime_mins` >= 0)),
  CONSTRAINT `chk_incidents_mttd_nonnegative` CHECK (((`mttd_minutes` is null) or (`mttd_minutes` >= 0))),
  CONSTRAINT `chk_incidents_mttr_nonnegative` CHECK (((`mttr_minutes` is null) or (`mttr_minutes` >= 0))),
  CONSTRAINT `chk_incidents_utc_order` CHECK (((`closed_at_utc` is null) or (`opened_at_utc` is null) or (`closed_at_utc` >= `opened_at_utc`)))
) ENGINE=InnoDB AUTO_INCREMENT=383 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `incidents`
--

LOCK TABLES `incidents` WRITE;
/*!40000 ALTER TABLE `incidents` DISABLE KEYS */;
INSERT INTO `incidents` VALUES (377,'INC-001',NULL,'Test Incident','DEMO Description','critical','closed',2,'Babai Chatterjee',2,'TileBar',1,'NODE',NULL,'Infrastructure',1,'Application',NULL,NULL,'[]','[{\"type\": \"comment\", \"action\": \"commented\", \"author\": \"Babai Chatterjee\", \"detail\": \"@Rohan Shelar take it forward\", \"author_id\": 2, \"created_at\": \"2026-07-29T12:17:32.046Z\"}]','2026-07-29 06:29','2026-07-29 06:29:00','2026-07-29 11:29:00.000000','2026-07-29 07:40','2026-07-29 07:40:00','2026-07-29 12:40:00.000000','2026-07-29','EST','Etc/GMT+5',0,30,30,'30m','Demo Cause','Demo Resolution','By OC Team',NULL,NULL,'5m',5,NULL,NULL,NULL,NULL,NULL,NULL,'10m',10,'2026-07-29 11:31:23','2026-07-29 12:17:32'),(378,'INC-002',NULL,'Test Incident2','Demo Cause','high','closed',2,'Babai Chatterjee',2,'Intrado',17,'Agile365',NULL,'Application',2,'Application',NULL,NULL,'[\"@Rohan Shelar\"]','[{\"type\": \"comment\", \"action\": \"commented\", \"author\": \"Babai Chatterjee\", \"detail\": \"@Rohan Shelar  Thank you for the help\", \"author_id\": 2, \"created_at\": \"2026-07-30T07:09:07.201Z\"}]','2026-07-29 06:27','2026-07-29 06:27:00','2026-07-29 00:57:00.000000','2026-07-29 06:43','2026-07-29 06:43:00','2026-07-29 12:43:00.000000','2026-07-29','CST','Etc/GMT+6',0,30,30,'30m','Demo Cause2','Demo Resolution 2','By OC Team',NULL,NULL,'5m',5,NULL,NULL,NULL,NULL,NULL,NULL,'10m',10,'2026-07-29 12:29:18','2026-07-30 07:09:07'),(382,'INC-003',NULL,'Test Incident4','Test Incident happend','medium','closed',2,'Babai Chatterjee',2,'Ives Bank',8,'NODE',NULL,'Infrastructure',1,'Integration',NULL,NULL,'[]','[{\"type\": \"comment\", \"action\": \"commented\", \"author\": \"Babai Chatterjee\", \"detail\": \"@Rohan Shelar Please check this further\", \"author_id\": 2, \"created_at\": \"2026-07-29T14:34:20.642Z\"}, {\"type\": \"comment\", \"action\": \"commented\", \"author\": \"Rohan Shelar\", \"detail\": \"@Babai Chatterjee I have changed the status. Please investigate the issue.\", \"author_id\": 3, \"created_at\": \"2026-07-29T14:37:58.519Z\"}]','2026-07-29 14:31','2026-07-29 14:31:00','2026-07-29 09:01:00.000000','2026-07-30 07:07','2026-07-30 07:07:00','2026-07-30 07:07:00.000000','2026-07-30','UTC','Etc/UTC',1,0,60,'1h','Demo Root cause','Demo Resolution','By OC Team',NULL,NULL,'5m',5,NULL,NULL,NULL,NULL,NULL,NULL,'10m',10,'2026-07-29 14:31:53','2026-07-30 07:08:10');
/*!40000 ALTER TABLE `incidents` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-30 17:44:54
