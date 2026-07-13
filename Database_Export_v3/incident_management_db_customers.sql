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

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ 'd568f69d-59dd-11f1-abe9-00090faa0001:1-304';

--
-- Table structure for table `customers`
--

DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `customer_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_branch` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `region` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timezone` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inbound_csm_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `outbound_csm_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customers_name` (`customer_name`),
  UNIQUE KEY `uq_customers_code` (`customer_code`),
  KEY `idx_customers_active_name` (`is_active`,`customer_name`),
  KEY `idx_customers_region` (`region`),
  KEY `idx_customers_csm` (`inbound_csm_name`,`outbound_csm_name`),
  KEY `fk_customers_created_by` (`created_by`),
  KEY `fk_customers_updated_by` (`updated_by`),
  CONSTRAINT `fk_customers_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_customers_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customers`
--

LOCK TABLES `customers` WRITE;
/*!40000 ALTER TABLE `customers` DISABLE KEYS */;
INSERT INTO `customers` VALUES (1,'TileBar','tilebar','US',NULL,'EST','Babai Chatterjee','Jonathan Kaplan',1,'2026-07-12 12:56:42','2026-07-12 13:06:44',NULL,NULL),(3,'NGC','ngc','US',NULL,'GMT','Rohan Shelar','Jonathan Kaplan',1,'2026-07-12 13:06:59','2026-07-12 13:07:37',3,3),(4,'MIS Cloud','mis_cloud',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:15:49','2026-07-12 13:15:49',3,3),(5,'Ramat-Gan Municipality','ramat_gan_municipality',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:16:19','2026-07-12 13:16:19',3,3),(6,'San Diego Airport','san_diego_airport',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:16:32','2026-07-12 13:16:32',3,3),(7,'MSE US - Achieva Credit Union','mse_us_achieva_credit_union',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:16:51','2026-07-12 13:16:51',3,3),(8,'Ives Bank','ives_bank',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:17:06','2026-07-12 13:17:06',3,3),(9,'MSE US - Morton Industries','mse_us_morton_industries',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:17:24','2026-07-12 13:17:24',3,3),(10,'TCP - Shields Harper','tcp_shields_harper',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:17:39','2026-07-12 13:17:39',3,3),(11,'BWC','bwc',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:17:51','2026-07-12 13:17:51',3,3),(12,'Christie Digital','christie_digital',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:18:02','2026-07-12 13:18:02',3,3),(13,'SMC','smc',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:18:09','2026-07-12 13:18:09',3,3),(14,'Mayer Electric','mayer_electric',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:18:21','2026-07-12 13:18:21',3,3),(15,'CCCU','cccu',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:18:35','2026-07-12 13:18:35',3,3),(16,'VB Cosmetics','vb_cosmetics',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:18:53','2026-07-12 13:18:53',3,3),(17,'Intrado','intrado',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:19:10','2026-07-12 13:19:10',3,3),(18,'Georg Jos. Kaes GmbH','georg_jos_kaes_gmbh',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:19:50','2026-07-12 13:19:50',3,3),(19,'Prettl','prettl',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:20:04','2026-07-12 13:20:04',3,3),(20,'TORIDOLL','toridoll',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:20:15','2026-07-12 13:20:15',3,3),(21,'AssetWatch','assetwatch',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 13:20:30','2026-07-12 13:20:30',3,3),(22,'VBC','vbc',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 21:33:52','2026-07-12 21:33:52',3,3),(23,'MSE US','mse_us',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 21:33:52','2026-07-12 21:33:52',3,3),(24,'Choctaw Nation','choctaw_nation',NULL,NULL,NULL,NULL,NULL,1,'2026-07-12 21:33:54','2026-07-12 21:33:54',3,3);
/*!40000 ALTER TABLE `customers` ENABLE KEYS */;
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

-- Dump completed on 2026-07-13 15:00:48
