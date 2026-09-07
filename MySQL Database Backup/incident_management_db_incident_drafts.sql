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
-- Dumping data for table `incident_drafts`
--

LOCK TABLES `incident_drafts` WRITE;
/*!40000 ALTER TABLE `incident_drafts` DISABLE KEYS */;
INSERT INTO `incident_drafts` VALUES (1,'DRF-MTPTITTD','AAMkAGE3NmI2MDhmLTllMTctNDg3Yy1iM2NlLTc2YzI3MjQzNzJmZQBGAAAAAAD6DeuoZHy5S4ei5j7L0wKXBwA3O7fr0h-uS50DgX13EgLHAAAAAAEMAAA3O7fr0h-uS50DgX13EgLHAAADrlS1AAA=',144,'2026-09-06 02:10:47','2026-09-06 02:20:47','finalized','{\"title\":\"Test Alert: Coralogix Alert on magic / Christie Digital - Project Status Down for more than 5mins\",\"customer\":\"Christie Digital\",\"project\":\"MES\",\"product_line\":\"Integration\",\"severity\":\"Critical\",\"status\":\"New\",\"engineer\":\"Rohan Shelar\",\"date_created\":\"2026-09-05 22:10\",\"startDT\":\"2026-09-05 22:10\",\"date_time_opened\":\"2026-09-05 22:10\",\"timezone\":\"EST\",\"mttd_minutes\":5,\"mttdStr\":\"5m\",\"sf_case\":\"\",\"rd_tickets\":\"\",\"description\":\"We\'ve detected that the query has exceeded 0 for over 0% of the following\",\"area\":\"Integration\",\"tags\":[],\"operations_email_audit_id\":144}',3,NULL,NULL,NULL,NULL,NULL,'2026-09-06 12:58:59','2026-09-06 13:00:30'),(2,'DRF-MTQZ9TOP','AAMkAGE3NmI2MDhmLTllMTctNDg3Yy1iM2NlLTc2YzI3MjQzNzJmZQBGAAAAAAD6DeuoZHy5S4ei5j7L0wKXBwA3O7fr0h-uS50DgX13EgLHAAAAAAEMAAA3O7fr0h-uS50DgX13EgLHAAADrlS9AAA=',147,'2026-09-07 06:28:01','2026-09-07 06:38:01','ready','{\"title\":\"Alert \'Critical Alert - MESInsights Health Status Inactive’ was fired\",\"customer\":\"NGC\",\"project\":\"MES Pilot\",\"product_line\":\"Application\",\"severity\":\"Critical\",\"status\":\"New\",\"engineer\":\"Babai Chatterjee\",\"date_created\":\"2026-09-07 06:28\",\"startDT\":\"2026-09-07 06:28\",\"date_time_opened\":\"2026-09-07 06:28\",\"timezone\":\"GMT\",\"mttd_minutes\":null,\"mttdStr\":\"\",\"sf_case\":\"\",\"rd_tickets\":\"\",\"description\":\"Alert \'Critical Alert - MESInsights Health Status Inactive’ was fired\",\"area\":\"NGC - MES\",\"tags\":[],\"operations_email_audit_id\":147}',2,NULL,NULL,NULL,'2026-09-07 10:12:47',2,'2026-09-07 08:27:43','2026-09-07 10:12:47'),(3,'DRF-MTR286E0','AAMkAGE3NmI2MDhmLTllMTctNDg3Yy1iM2NlLTc2YzI3MjQzNzJmZQBGAAAAAAD6DeuoZHy5S4ei5j7L0wKXBwA3O7fr0h-uS50DgX13EgLHAAAAAAEMAAA3O7fr0h-uS50DgX13EgLHAAADrlS7AAA=',152,'2026-09-06 16:00:05','2026-09-06 16:10:05','finalized','{\"title\":\"Coralogix Alert on magic / VBC_EC2 High Memory Usage\",\"customer\":\"VBC\",\"project\":\"ShopifyToSyspro, Amazon\",\"product_line\":\"Integration\",\"severity\":\"Critical\",\"status\":\"New\",\"engineer\":\"Babai Chatterjee\",\"date_created\":\"2026-09-06 09:00\",\"startDT\":\"2026-09-06 09:00\",\"date_time_opened\":\"2026-09-06 09:00\",\"timezone\":\"MST\",\"mttd_minutes\":2,\"mttdStr\":\"2m\",\"sf_case\":\"\",\"rd_tickets\":\"\",\"description\":\"We\'ve detected that the project is taking more than 4gb memory.\",\"area\":\"Integration\",\"tags\":[],\"operations_email_audit_id\":152}',2,743,NULL,NULL,NULL,NULL,'2026-09-07 09:50:25','2026-09-07 09:53:17'),(4,'DRF-MTR2J2ZQ','AAMkAGE3NmI2MDhmLTllMTctNDg3Yy1iM2NlLTc2YzI3MjQzNzJmZQBGAAAAAAD6DeuoZHy5S4ei5j7L0wKXBwA3O7fr0h-uS50DgX13EgLHAAAAAAEMAAA3O7fr0h-uS50DgX13EgLHAAADrlS_AAA=',153,'2026-09-07 09:50:36','2026-09-07 10:00:36','ready','{\"title\":\"Azure: Activated Severity: 2 CPU Usage\",\"customer\":\"NGC\",\"project\":\"All Projects\",\"product_line\":\"Application\",\"severity\":\"Critical\",\"status\":\"New\",\"engineer\":\"Babai Chatterjee\",\"date_created\":\"2026-09-07 09:50\",\"startDT\":\"2026-09-07 09:50\",\"date_time_opened\":\"2026-09-07 09:50\",\"timezone\":\"GMT\",\"mttd_minutes\":2,\"mttdStr\":\"2m\",\"sf_case\":\"\",\"rd_tickets\":\"\",\"description\":\"Azure: Activated Severity: 2 CPU Usage\",\"area\":\"Infrastructure\",\"tags\":[],\"operations_email_audit_id\":153}',2,NULL,NULL,NULL,'2026-09-07 10:12:49',2,'2026-09-07 09:58:54','2026-09-07 10:12:49');
/*!40000 ALTER TABLE `incident_drafts` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-07 15:50:38
