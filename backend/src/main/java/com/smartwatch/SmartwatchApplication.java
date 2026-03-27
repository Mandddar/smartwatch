package com.smartwatch;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Virtual Smartwatch Health Monitoring Platform.
 * Hardware simulation: scheduler generates vitals when device connected.
 * Real hardware later replaces scheduler - nothing else changes.
 */
@SpringBootApplication
@EnableScheduling
public class SmartwatchApplication {

    public static void main(String[] args) {
        SpringApplication.run(SmartwatchApplication.class, args);
    }
}
