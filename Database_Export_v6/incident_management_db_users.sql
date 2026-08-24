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
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `department` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bio` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'stakeholder',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_users_role` (`role`),
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role`) REFERENCES `roles` (`role_key`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (2,'Babai Chatterjee','9975348665','ITS','Pune','Support Engineer','babai_chatterjee@magicsoftware.com','$2a$12$sQSLiyu/txTpagCvi7c2h.wsPUhNSBi21B3ywaeiGD0zKMwMQ34nS','admin',1,'2026-07-12 11:22:52'),(3,'Rohan Shelar',NULL,NULL,NULL,NULL,'rohan_shelar@magicsoftware.com','$2a$12$lePYOyxn1RIIu3Q7Hyn/GOgmsF0MDqSP3S9YtdYryf7q7oPYxkHvi','admin',1,'2026-07-12 11:22:52'),(4,'Neeshu Malik',NULL,NULL,NULL,NULL,'neeshu_malik@magicsoftware.com','neeshu123','admin',1,'2026-07-12 11:22:52'),(7,'Amjad Madre',NULL,NULL,NULL,NULL,'Amjad_Madre@magicsoftware.com','amjad123','admin',1,'2026-07-12 14:44:46'),(8,'Aniruddh Potdar',NULL,NULL,NULL,NULL,'Aniruddh_Potdar@magicsoftware.com','$2a$12$XD1yIC841uGBRmAtHfs/V.GlOMiV4W3PIajYrxkP4FvzufGM8./IC','aoc',1,'2026-07-12 14:44:46'),(10,'Avinash Mamale',NULL,NULL,NULL,NULL,'Avinash_Mamale@magicsoftware.com','$2a$12$CcWPDppYCeLndM5figiz5O70e1gT7P1STU0xyGTxm7UjbZpj0vOYG','aoc',1,'2026-07-12 14:44:46'),(11,'Balaji Karagir',NULL,NULL,NULL,NULL,'Balaji_Karagir@magicsoftware.com','balaji123','aoc',1,'2026-07-12 14:44:46'),(12,'Darpan Bandil',NULL,NULL,NULL,NULL,'Darpan_Bandil@magicsoftware.com','darpan123','aoc',1,'2026-07-12 14:44:46'),(13,'Lena Levin',NULL,NULL,NULL,NULL,'Lena_Levin@magicsoftware.com','lena123','aoc',1,'2026-07-12 14:44:46'),(14,'Mrunal Rajkar',NULL,NULL,NULL,NULL,'Mrunal_Rajkar@magicsoftware.com','mrunal123','aoc',1,'2026-07-12 14:44:46'),(16,'Pooja Thakkhi',NULL,NULL,NULL,NULL,'Pooja_Thakkhi@magicsoftware.com','pooja123','aoc',1,'2026-07-12 14:44:46'),(18,'Shantanu Patil',NULL,NULL,NULL,NULL,'Shantanu_Patil@magicsoftware.com','shantanu123','aoc',1,'2026-07-12 14:44:46'),(19,'Sushant Tadke',NULL,NULL,NULL,NULL,'Sushant_Tadke@magicsoftware.com','sushant123','aoc',1,'2026-07-12 14:44:46'),(20,'Vibha Khanke',NULL,NULL,NULL,NULL,'Vibha_Khanke@magicsoftware.com','vibha123','aoc',1,'2026-07-12 14:44:46'),(21,'Vinayank Dane',NULL,NULL,NULL,NULL,'Vinayank_Dane@magicsoftware.com','vinayank123','aoc',1,'2026-07-12 14:44:46'),(22,'Aatif Shaikh',NULL,NULL,NULL,NULL,'Aatif_Shaikh@magicsoftware.com','aatif123','aoc',1,'2026-07-12 14:49:08'),(23,'Abhishek Pawar',NULL,NULL,NULL,NULL,'Abhishek_Pawar@magicsoftware.com','abhishek123','aoc',1,'2026-07-12 14:49:08'),(24,'Prachi Palande',NULL,'CSO',NULL,NULL,'prachi_palande@magicsoftware.com','$2a$12$tEMG8apBs7L9BS0Hs22E9e8HhdOIl4/pBE5wwEFqOPbYMkka6pnha','cso',1,'2026-08-06 12:10:21'),(25,'Nikhil Kawade',NULL,'CSO',NULL,NULL,'nikhil_kawade@magicsoftware.com','$2a$12$ULMTNfPDO/31nngxgYKzheRc54azl3bV//fF6gFaVmgagZc2KDrji','cso',1,'2026-08-06 12:11:01'),(26,'Shravani Bhosale',NULL,'CSO',NULL,NULL,'shravani_bhosale@magicsoftware.com','$2a$12$q3TvGNeEA0lVa/mzQev1Keu6zXWf51vTvUFln2x3ArzJ2NdXob/o.','cso',1,'2026-08-06 12:11:41'),(27,'Jidnyasa Patil',NULL,'CSO',NULL,NULL,'jidnyasa_patil@magicsoftware.com','$2a$12$LlGINlG3SfXN6ne38nAvmO6XXeNapftq8cii3ET2R14ir/U7lFqG6','cso',1,'2026-08-06 12:12:25'),(28,'Anuja Bagadi',NULL,'ITS',NULL,NULL,'anuja_sasane@magicsoftware.com','$2a$12$n3Sr/9DH6kneZWhNsttYVevHEkHg0M1keoTtQpRxeYb7hPy3/hHyi','aoc',1,'2026-08-06 14:34:51');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-18 15:40:52
