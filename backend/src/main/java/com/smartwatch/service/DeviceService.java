package com.smartwatch.service;

import com.smartwatch.model.Device;
import com.smartwatch.model.User;
import com.smartwatch.repository.DeviceRepository;
import com.smartwatch.repository.UserRepository;
import com.smartwatch.exception.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * Device connect/disconnect - simulates "Connect Device" button.
 * CONNECTED = scheduler generates vitals; DISCONNECTED = no generation.
 */
@Service
public class DeviceService {

    private final DeviceRepository deviceRepository;
    private final UserRepository userRepository;

    public DeviceService(DeviceRepository deviceRepository, UserRepository userRepository) {
        this.deviceRepository = deviceRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public void connect(Long userId) {
        Device device = getOrCreateDevice(userId);
        device.setStatus(Device.Status.CONNECTED);
        device.setLastConnectedAt(LocalDateTime.now());
        deviceRepository.save(device);
    }

    @Transactional
    public void disconnect(Long userId) {
        Device device = getOrCreateDevice(userId);
        device.setStatus(Device.Status.DISCONNECTED);
        deviceRepository.save(device);
    }

    public Device.Status getStatus(Long userId) {
        return getOrCreateDevice(userId).getStatus();
    }

    private Device getOrCreateDevice(Long userId) {
        User user = userRepository.findById(userId).orElseThrow(() -> new NotFoundException("User not found"));
        return deviceRepository.findByUserId(userId)
                .orElseGet(() -> {
                    Device d = new Device();
                    d.setUser(user);
                    user.setDevice(d);
                    return deviceRepository.save(d);
                });
    }
}
