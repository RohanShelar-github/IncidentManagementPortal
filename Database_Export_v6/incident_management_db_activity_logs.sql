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
) ENGINE=InnoDB AUTO_INCREMENT=164 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activity_logs`
--

LOCK TABLES `activity_logs` WRITE;
/*!40000 ALTER TABLE `activity_logs` DISABLE KEYS */;
INSERT INTO `activity_logs` VALUES (84,536,'edit',2,'Incident updated','2026-07-30 16:09:57'),(85,525,'comment',3,'@Babai Chatterjee Please verify the incident details.','2026-08-04 13:35:39'),(92,595,'create',2,'Incident created','2026-08-05 09:57:08'),(93,595,'edit',2,'Incident updated','2026-08-05 10:00:57'),(94,595,'edit',2,'Incident updated','2026-08-05 10:01:39'),(95,595,'edit',2,'Incident updated','2026-08-05 10:01:39'),(96,595,'comment',2,'This issue is temporararily resolved by redeploying affected projects.','2026-08-05 10:07:11'),(99,598,'create',3,'Incident created','2026-08-05 17:15:30'),(101,598,'edit',3,'Incident updated','2026-08-05 17:19:46'),(102,598,'edit',3,'Incident updated','2026-08-05 17:31:12'),(103,598,'edit',3,'Incident updated','2026-08-05 17:32:29'),(114,606,'create',19,'Incident created','2026-08-08 14:55:42'),(115,606,'edit',19,'Incident updated','2026-08-08 15:02:01'),(116,606,'edit',19,'Incident updated','2026-08-08 15:04:40'),(117,606,'edit',19,'Incident updated','2026-08-08 15:05:05'),(118,607,'create',3,'Incident created','2026-08-09 10:08:05'),(119,607,'edit',3,'Incident updated','2026-08-09 10:45:24'),(120,607,'edit',3,'Incident updated','2026-08-09 10:55:13'),(121,607,'edit',3,'Incident updated','2026-08-10 05:51:31'),(122,607,'edit',3,'Incident updated','2026-08-10 05:51:42'),(124,609,'create',11,'Incident created','2026-08-12 03:16:40'),(125,610,'create',11,'Incident created','2026-08-12 03:24:17'),(126,610,'edit',11,'Incident updated','2026-08-12 03:28:07'),(127,609,'edit',11,'Incident updated','2026-08-12 03:29:30'),(129,612,'create',11,'Incident created','2026-08-12 03:33:13'),(130,612,'edit',11,'Incident updated','2026-08-12 03:35:05'),(131,612,'edit',2,'Incident updated','2026-08-12 05:39:03'),(132,609,'edit',11,'Incident updated','2026-08-12 05:48:00'),(133,612,'edit',11,'Incident updated','2026-08-12 05:49:16'),(134,612,'edit',11,'Incident updated','2026-08-12 05:49:37'),(135,610,'edit',11,'Incident updated','2026-08-12 05:50:01'),(136,610,'edit',11,'Incident updated','2026-08-12 05:51:16'),(137,610,'edit',11,'Incident updated','2026-08-12 05:51:35'),(138,610,'edit',11,'Incident updated','2026-08-12 05:51:38'),(139,609,'edit',11,'Incident updated','2026-08-12 05:53:21'),(140,609,'edit',11,'Incident updated','2026-08-12 05:53:27'),(143,615,'create',22,'Incident created','2026-08-13 20:17:07'),(144,615,'edit',22,'Incident updated','2026-08-13 20:19:25'),(145,615,'edit',22,'Incident updated','2026-08-13 20:22:22'),(146,615,'edit',22,'Incident updated','2026-08-13 20:26:12'),(147,610,'edit',22,'Incident updated','2026-08-13 20:33:34'),(148,610,'edit',22,'Incident updated','2026-08-13 20:36:22'),(149,616,'create',14,'Incident created','2026-08-14 06:26:34'),(150,616,'edit',14,'Incident updated','2026-08-14 06:28:35'),(151,616,'edit',14,'Incident updated','2026-08-14 06:30:20'),(152,617,'create',14,'Incident created','2026-08-14 06:38:23'),(153,617,'edit',14,'Incident updated','2026-08-14 06:39:29'),(154,618,'create',2,'Incident created','2026-08-14 13:13:37'),(155,617,'edit',2,'Incident updated','2026-08-14 13:14:41'),(156,616,'edit',2,'Incident updated','2026-08-14 13:14:47'),(157,618,'edit',2,'Incident updated','2026-08-14 13:29:26'),(158,618,'edit',2,'Incident updated','2026-08-14 13:34:07'),(159,619,'create',28,'Incident created','2026-08-17 00:28:28'),(160,619,'edit',28,'Incident updated','2026-08-17 00:31:49'),(161,619,'edit',28,'Incident updated','2026-08-17 00:31:54'),(162,618,'edit',2,'Incident updated','2026-08-17 09:07:55'),(163,618,'edit',2,'Incident updated','2026-08-17 09:11:31');
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

-- Dump completed on 2026-08-18 15:40:49
