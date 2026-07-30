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
-- Table structure for table `activity_logs`
--

DROP TABLE IF EXISTS `activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `incident_id` int DEFAULT NULL,
  `action_type` varchar(50) NOT NULL,
  `action_by` int DEFAULT NULL,
  `detail` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `action_by` (`action_by`),
  KEY `idx_activity_incident` (`incident_id`),
  CONSTRAINT `activity_logs_ibfk_1` FOREIGN KEY (`incident_id`) REFERENCES `incidents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `activity_logs_ibfk_2` FOREIGN KEY (`action_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=79 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activity_logs`
--

LOCK TABLES `activity_logs` WRITE;
/*!40000 ALTER TABLE `activity_logs` DISABLE KEYS */;
INSERT INTO `activity_logs` VALUES (61,377,'create',2,'Incident created','2026-07-29 11:31:23'),(62,377,'edit',2,'Incident updated','2026-07-29 11:39:32'),(63,377,'edit',2,'Incident updated','2026-07-29 11:40:19'),(64,377,'comment',2,'@Rohan Shelar take it forward','2026-07-29 12:17:32'),(65,378,'create',2,'Incident created','2026-07-29 12:29:18'),(66,378,'edit',2,'Incident updated','2026-07-29 12:43:41'),(72,382,'create',2,'Incident created','2026-07-29 14:31:53'),(73,382,'comment',2,'@Rohan Shelar Please check this further','2026-07-29 14:34:20'),(74,382,'edit',2,'Incident updated','2026-07-29 14:36:11'),(75,382,'edit',3,'Incident updated','2026-07-29 14:37:34'),(76,382,'comment',3,'@Babai Chatterjee I have changed the status. Please investigate the issue.','2026-07-29 14:37:58'),(77,382,'edit',2,'Incident updated','2026-07-30 07:08:10'),(78,378,'comment',2,'@Rohan Shelar  Thank you for the help','2026-07-30 07:09:07');
/*!40000 ALTER TABLE `activity_logs` ENABLE KEYS */;
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
