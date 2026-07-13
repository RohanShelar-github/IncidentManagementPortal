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
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('admin','cso','pmo','aoc','engineer','stakeholder','viewer') COLLATE utf8mb4_unicode_ci DEFAULT 'viewer',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Admin User','admin@magiccloud.io','Admin@123','admin','2026-07-12 11:22:52'),(2,'Babai Chatterjee','babai_chatterjee@magicsoftware.com','babai123','admin','2026-07-12 11:22:52'),(3,'Rohan Shelar','rohan_shelar@magicsoftware.com','rohan123','admin','2026-07-12 11:22:52'),(4,'Neeshu Malik','neeshu_malik@magicsoftware.com','neeshu123','pmo','2026-07-12 11:22:52'),(5,'CSO User','cso@magiccloud.io','$2b$10$LWBSQQJzVvQJ1lG8PgJlCOD3y4ZXs1SixDPRLNEITJm/TS0iOvMPm','cso','2026-07-12 11:22:52'),(6,'AOC User','aoc@magiccloud.io','$2b$10$LWBSQQJzVvQJ1lG8PgJlCOD3y4ZXs1SixDPRLNEITJm/TS0iOvMPm','aoc','2026-07-12 11:22:52'),(7,'Amjad Madre','Amjad_Madre@magicsoftware.com','amjad123','aoc','2026-07-12 14:44:46'),(8,'Aniruddh Potdar','Aniruddh_Potdar@magicsoftware.com','aniruddh123','aoc','2026-07-12 14:44:46'),(9,'Anuja Begadi','Anuja_Begadi@magicsoftware.com','anuja123','aoc','2026-07-12 14:44:46'),(10,'Avinash Mamale','Avinash_Mamale@magicsoftware.com','avinash123','aoc','2026-07-12 14:44:46'),(11,'Balaji Karagir','Balaji_Karagir@magicsoftware.com','balaji123','aoc','2026-07-12 14:44:46'),(12,'Darpan Bandil','Darpan_Bandil@magicsoftware.com','darpan123','aoc','2026-07-12 14:44:46'),(13,'Lena Levin','Lena_Levin@magicsoftware.com','lena123','aoc','2026-07-12 14:44:46'),(14,'Mrunal Rajkar','Mrunal_Rajkar@magicsoftware.com','mrunal123','aoc','2026-07-12 14:44:46'),(15,'Nikhil Kawade','Nikhil_Kawade@magicsoftware.com','nikhil123','aoc','2026-07-12 14:44:46'),(16,'Pooja Thakkhi','Pooja_Thakkhi@magicsoftware.com','pooja123','aoc','2026-07-12 14:44:46'),(17,'Prachi Palande','Prachi_Palande@magicsoftware.com','prachi123','aoc','2026-07-12 14:44:46'),(18,'Shantanu Patil','Shantanu_Patil@magicsoftware.com','shantanu123','aoc','2026-07-12 14:44:46'),(19,'Shushant Tadke','Shushant_Tadke@magicsoftware.com','shushant123','aoc','2026-07-12 14:44:46'),(20,'Vibha Khanke','Vibha_Khanke@magicsoftware.com','vibha123','aoc','2026-07-12 14:44:46'),(21,'Vinayank Dane','Vinayank_Dane@magicsoftware.com','vinayank123','aoc','2026-07-12 14:44:46'),(22,'Aatif Shaikh','Aatif_Shaikh@magicsoftware.com','aatif123','aoc','2026-07-12 14:49:08'),(23,'Abhishek Pawar','Abhishek_Pawar@magicsoftware.com','abhishek123','aoc','2026-07-12 14:49:08');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
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

-- Dump completed on 2026-07-13 15:00:47
