CREATE DATABASE  IF NOT EXISTS `incident_management_db` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `incident_management_db`;
-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: incident_management_db
-- ------------------------------------------------------
-- Server version	9.7.0

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
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ 'd568f69d-59dd-11f1-abe9-00090faa0001:1-289';

--
-- Table structure for table `incidents`
--

DROP TABLE IF EXISTS `incidents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `incidents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `incident_ref` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `legacy_case_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `severity` enum('low','medium','high','critical','normal') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('open','in_progress','further_investigation','escalated_to_rd','escalated_to_3rd_party','resolved','closed') COLLATE utf8mb4_unicode_ci DEFAULT 'open',
  `assigned_to` int DEFAULT NULL,
  `case_owner` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int NOT NULL,
  `customer` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` int DEFAULT NULL,
  `project` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `project_area` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `area` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `area_id` int DEFAULT NULL,
  `product_line` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `components` text COLLATE utf8mb4_unicode_ci,
  `applications` text COLLATE utf8mb4_unicode_ci,
  `sla_hours` float DEFAULT NULL,
  `tags` json DEFAULT NULL,
  `start_dt` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_time_opened` datetime DEFAULT NULL,
  `end_dt` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_time_closed` datetime DEFAULT NULL,
  `closed_date` date DEFAULT NULL,
  `timezone` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'IST',
  `downtime_hours` int DEFAULT '0',
  `downtime_minutes` int DEFAULT '0',
  `downtime_mins` int NOT NULL DEFAULT '0',
  `downtime_str` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rca` text COLLATE utf8mb4_unicode_ci,
  `resolution` text COLLATE utf8mb4_unicode_ci,
  `resolved_by` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sf_case_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incident_report_status` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mttd_str` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mttd_minutes` int DEFAULT NULL,
  `legacy_month` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `internal_status` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rd_tickets` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `legacy_source` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `legacy_raw` json DEFAULT NULL,
  `mttr_str` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  CONSTRAINT `fk_incidents_area_id` FOREIGN KEY (`area_id`) REFERENCES `area` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_incidents_customer_id` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `incidents_ibfk_1` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `incidents_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `incidents`
--

LOCK TABLES `incidents` WRITE;
/*!40000 ALTER TABLE `incidents` DISABLE KEYS */;
/*!40000 ALTER TABLE `incidents` ENABLE KEYS */;
UNLOCK TABLES;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-13  2:49:35
