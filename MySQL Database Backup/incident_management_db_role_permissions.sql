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
-- Dumping data for table `role_permissions`
--

LOCK TABLES `role_permissions` WRITE;
/*!40000 ALTER TABLE `role_permissions` DISABLE KEYS */;
INSERT INTO `role_permissions` VALUES (1,'assign_roles'),(1,'close_incidents'),(4,'close_incidents'),(5,'close_incidents'),(1,'create_incidents'),(4,'create_incidents'),(5,'create_incidents'),(1,'delete_incidents'),(1,'delete_mailbox'),(1,'edit_incidents'),(4,'edit_incidents'),(5,'edit_incidents'),(1,'export_reports'),(2,'export_reports'),(3,'export_reports'),(4,'export_reports'),(1,'manage_data'),(3,'manage_data'),(1,'manage_roles'),(1,'manage_users'),(1,'send_mailbox'),(4,'send_mailbox'),(1,'view_customer360'),(2,'view_customer360'),(3,'view_customer360'),(4,'view_customer360'),(5,'view_customer360'),(1,'view_dashboard'),(2,'view_dashboard'),(3,'view_dashboard'),(4,'view_dashboard'),(5,'view_dashboard'),(6,'view_dashboard'),(1,'view_incidents'),(2,'view_incidents'),(3,'view_incidents'),(4,'view_incidents'),(5,'view_incidents'),(6,'view_incidents'),(1,'view_mailbox'),(4,'view_mailbox'),(1,'view_reports'),(2,'view_reports'),(3,'view_reports'),(4,'view_reports'),(5,'view_reports');
/*!40000 ALTER TABLE `role_permissions` ENABLE KEYS */;
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
