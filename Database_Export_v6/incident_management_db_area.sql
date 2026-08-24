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
-- Table structure for table `area`
--

DROP TABLE IF EXISTS `area`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `area` (
  `id` int NOT NULL AUTO_INCREMENT,
  `area_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `area_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_area_name` (`area_name`),
  UNIQUE KEY `uq_area_code` (`area_code`),
  KEY `idx_area_active_name` (`is_active`,`area_name`),
  KEY `fk_area_created_by` (`created_by`),
  KEY `fk_area_updated_by` (`updated_by`),
  CONSTRAINT `fk_area_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_area_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `area`
--

LOCK TABLES `area` WRITE;
/*!40000 ALTER TABLE `area` DISABLE KEYS */;
INSERT INTO `area` VALUES (1,'Infrastructure','INFRA',1,'2026-07-12 12:56:42','2026-07-12 13:38:06',NULL,NULL),(2,'Application','APP',1,'2026-07-12 12:56:42','2026-07-29 08:21:25',NULL,3),(6,'Workspace','WORKSPACE',1,'2026-07-12 13:38:15','2026-07-12 13:38:15',NULL,NULL),(7,'NGC','NGC',0,'2026-07-12 21:33:52','2026-07-29 08:15:33',3,3),(8,'Historian','HISTORIAN',1,'2026-07-12 21:33:52','2026-07-12 21:33:52',3,3),(9,'MES','MES',0,'2026-07-12 21:33:52','2026-07-29 08:15:28',3,3),(10,'Redis','REDIS',1,'2026-07-12 21:33:52','2026-07-12 21:33:52',3,3),(11,'SF_Magento_V4','SF_MAGENTO_V4',0,'2026-07-12 21:33:52','2026-07-29 08:13:25',3,3),(12,'XPA','XPA',0,'2026-07-12 21:33:53','2026-07-29 08:13:27',3,3),(13,'XPI','XPI',0,'2026-07-12 21:33:53','2026-07-29 08:13:29',3,3),(14,'CD','CD',0,'2026-07-12 21:33:53','2026-07-29 08:13:19',3,3),(15,'AIML','AIML',0,'2026-07-12 21:33:53','2026-07-29 08:14:16',3,3),(16,'MDE','MDE',0,'2026-07-12 21:33:53','2026-07-29 08:18:51',3,3),(17,'Integration','INTEGRATION',1,'2026-07-12 21:33:54','2026-07-29 08:21:48',3,3),(18,'Demo','demo',0,'2026-07-29 08:11:21','2026-07-29 08:13:13',3,3),(19,'NGC - AIML','ngc_aiml',1,'2026-07-29 08:13:49','2026-07-29 08:13:49',3,3),(20,'NGC - MDE','ngc_mde',1,'2026-07-29 08:14:22','2026-07-29 08:14:22',3,3),(21,'NGC - MES','ngc_mes',1,'2026-07-29 08:14:34','2026-07-29 08:14:34',3,3);
/*!40000 ALTER TABLE `area` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-18 15:40:51
