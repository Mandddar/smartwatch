package com.smartwatch.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Device entity - simulates wearable.
 * status CONNECTED = scheduler generates vitals; DISCONNECTED = no generation.
 * "Connect Device" button sets CONNECTED; real hardware later replaces this.
 */
@Entity
@Table(name = "devices")
public class Device {

    public enum Status { CONNECTED, DISCONNECTED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.DISCONNECTED;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    private LocalDateTime lastConnectedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public LocalDateTime getLastConnectedAt() { return lastConnectedAt; }
    public void setLastConnectedAt(LocalDateTime t) { this.lastConnectedAt = t; }
}
