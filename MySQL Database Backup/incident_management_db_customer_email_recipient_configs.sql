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
-- Dumping data for table `customer_email_recipient_configs`
--

LOCK TABLES `customer_email_recipient_configs` WRITE;
/*!40000 ALTER TABLE `customer_email_recipient_configs` DISABLE KEYS */;
INSERT INTO `customer_email_recipient_configs` VALUES (1,3,'NGC','jkaplan@magicsoftware.com,Mayur_Jaipurkar@magicsoftware.com,Abhishek_Gawali@magicsoftware.com,Rohan_Vikhe@magicsoftware.com,jaiprakash_prajapati@magicsoftware.com','Rohan_Shelar@magicsoftware.com,its24x7@magicsoftware.com,cloudopssupport@magicsoftware.com',1,'2026-08-23',NULL,'2026-08-23 14:04:28','2026-08-23 14:04:28'),(2,15,'CCCU','prachi_palande@magicsoftware.com,cloudopssupport@magicsoftware.com','ryan_beck@magicsoftware.com,jkaplan@magicsoftware.com,lhoon@magicsoftware.com,nicole.downing@sugarcrm.com,jdalpezzo@calcoastcu.org,dculham@calcoastcu.org,skalyanapu@calcoastcu.org,its24x7@magicsoftware.com',1,'2026-08-24',NULL,'2026-08-24 13:56:28','2026-08-24 13:56:28'),(3,16,'VB Cosmetics','babai_chatterjee@magicsoftware.com,cloudopssupport@magicsoftware.com','vhaimov@magicsoftware.com,jkaplan@magicsoftware.com,lhoon@magicsoftware.com,asim_maltare@magicsoftware.com,shubham_mote@magicsoftware.com,ksheer@vbcosmetics.com,jbennett@vbcosmetics.com,bdosi@vbcosmetics.com,its24x7@magicsoftware.com',1,'2026-08-24',NULL,'2026-08-24 13:56:28','2026-08-24 13:56:28'),(4,12,'Christie Digital','nikhil_kawade@magicsoftware.com,cloudopssupport@magicsoftware.com','vhaimov@magicsoftware.com,renee.dinh@christiedigital.com,sherry.yan@christiedigital.com,ranjit.tulasi@christiedigital.com,lhoon@magicsoftware.com,jkaplan@magicsoftware.com,asim_maltare@magicsoftware.com,its24x7@magicsoftware.com',1,'2026-08-24',NULL,'2026-08-24 13:56:28','2026-08-24 13:56:28'),(5,17,'Intrado','babai_chatterjee@magicsoftware.com,cloudopssupport@magicsoftware.com','vhaimov@magicsoftware.com,jkaplan@magicsoftware.com,lhoon@magicsoftware.com,kcrathjen@intrado.com,jpyuliat@intrado.com,d365prodsupport@intrado.com,its24x7@magicsoftware.com',1,'2026-08-24',NULL,'2026-08-24 13:56:28','2026-08-24 13:56:28'),(6,13,'SMC','babai_chatterjee@magicsoftware.com,cloudopssupport@magicsoftware.com','ryan_beck@magicsoftware.com,lhoon@magicsoftware.com,jkaplan@magicsoftware.com,soon.van@sugarcrm.com,meredith.christenson@sugarcrm.com,GLB-MSG-IT-SugarConnectAdmin@smc.com,its24x7@magicsoftware.com',1,'2026-08-24',NULL,'2026-08-24 13:56:28','2026-08-24 13:56:28'),(7,1,'TileBar','babai_chatterjee@magicsoftware.com,cloudopssupport@magicsoftware.com','vhaimov@magicsoftware.com,lhoon@magicsoftware.com,jkaplan@magicsoftware.com,malyeshmerni@tilebar.com,heshy@tilebar.com,gholman@tilebar.com,rradcliffe@tilebar.com,its24x7@magicsoftware.com',1,'2026-08-24',NULL,'2026-08-24 13:56:28','2026-08-24 13:56:28'),(8,11,'BWC','prachi_palande@magicsoftware.com,cloudopssupport@magicsoftware.com','vhaimov@magicsoftware.com,lhoon@magicsoftware.com,jkaplan@magicsoftware.com,asim_maltare@magicsoftware.com,rcastro@bwc.com,its24x7@magicsoftware.com',1,'2026-08-24',NULL,'2026-08-24 13:56:28','2026-08-24 13:56:28'),(9,10,'TCP - Shields Harper','prachi_palande@magicsoftware.com,cloudopssupport@magicsoftware.com','ryan_beck@magicsoftware.com,lhoon@magicsoftware.com,jkaplan@magicsoftware.com,pchae@shieldsharper.com,jestes@shieldsharper.com,its24x7@magicsoftware.com',1,'2026-08-24',NULL,'2026-08-24 13:56:28','2026-08-24 13:56:28'),(10,9,'MSE US - Morton Industries','prachi_palande@magicsoftware.com,cloudopssupport@magicsoftware.com','ryan_beck@magicsoftware.com,lhoon@magicsoftware.com,jkaplan@magicsoftware.com,c.sapp@mortonind.com,jegli@mortonind.com,its24x7@magicsoftware.com',1,'2026-08-24',NULL,'2026-08-24 13:56:28','2026-08-24 13:56:28'),(11,7,'MSE US - Achieva Credit Union','prachi_palande@magicsoftware.com,cloudopssupport@magicsoftware.com','ryan_beck@magicsoftware.com,lhoon@magicsoftware.com,jkaplan@magicsoftware.com,applicationadmins@achievacu.com,its24x7@magicsoftware.com',1,'2026-08-24',NULL,'2026-08-24 13:56:28','2026-08-24 13:56:28'),(12,8,'Ives Bank','prachi_palande@magicsoftware.com,cloudopssupport@magicsoftware.com','ryan_beck@magicsoftware.com,jkaplan@magicsoftware.com,lhoon@magicsoftware.com,asim_maltare@magicsoftware.com,nicole.downing@sugarcrm.com,RThach@ivesbank.com,mkeeler@ivesbank.com,its24x7@magicsoftware.com',1,'2026-08-24',NULL,'2026-08-24 13:56:28','2026-08-24 13:56:28'),(13,6,'San Diego Airport','prachi_palande@magicsoftware.com,cloudopssupport@magicsoftware.com','ryan_beck@magicsoftware.com,rbhojwan@san.org,mvaradar@san.org,syadaval@san.org,its24x7@magicsoftware.com',1,'2026-08-24',NULL,'2026-08-24 13:56:28','2026-08-24 13:56:28'),(14,19,'Prettl','nikhil_kawade@magicsoftware.com,cloudopssupport@magicsoftware.com','oliver_hoehn@magicsoftware.com,dmitryb@magicsoftware.com,sherbert@magicsoftware.com,babai_chatterjee@magicsoftware.com,Prettl-EDI@magicsoftware.com,its24x7@magicsoftware.com',1,'2026-08-24',NULL,'2026-08-24 13:56:28','2026-08-24 13:56:28'),(15,20,'TORIDOLL','nikhil_kawade@magicsoftware.com,cloudopssupport@magicsoftware.com','sunao_nonaka@magicsoftware.com,msj-toridoll@magicsoftware.com,its24x7@magicsoftware.com',1,'2026-08-24',NULL,'2026-08-24 13:56:28','2026-08-24 13:56:28'),(16,5,'Ramat-Gan Municipality','prachi_palande@magicsoftware.com,cloudopssupport@magicsoftware.com','azthaer@magicsoftware.com,irar@magicsoftware.com,shayz@magicsoftware.com,mayan@magicsoftware.com,its24x7@magicsoftware.com',1,'2026-08-24',NULL,'2026-08-24 13:56:28','2026-08-24 13:56:28'),(17,4,'MIS Cloud','Rohan_Shelar@magicsoftware.com,cloudopssupport@magicsoftware.com','Regina_Shinde@magicsoftware.com,Mayur_Jaipurkar@magicsoftware.com,its24x7@magicsoftware.com',1,'2026-08-24',NULL,'2026-08-24 13:56:28','2026-08-24 13:56:28');
/*!40000 ALTER TABLE `customer_email_recipient_configs` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-07 15:50:36
