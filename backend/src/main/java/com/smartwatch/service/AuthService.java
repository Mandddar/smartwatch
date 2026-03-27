package com.smartwatch.service;

import com.smartwatch.dto.AuthResponse;
import com.smartwatch.dto.LoginRequest;
import com.smartwatch.dto.RegisterRequest;
import com.smartwatch.exception.BadRequestException;
import com.smartwatch.model.Device;
import com.smartwatch.model.NotificationPreference;
import com.smartwatch.model.User;
import com.smartwatch.repository.UserRepository;
import com.smartwatch.config.JwtUtil;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtUtil jwtUtil) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    @Transactional
    public AuthResponse register(RegisterRequest req) {
        if (userRepository.existsByEmail(req.email())) {
            throw new BadRequestException("Email already registered");
        }
        User user = new User();
        user.setName(req.name());
        user.setEmail(req.email());
        user.setPassword(passwordEncoder.encode(req.password()));
        user.setDateOfBirth(req.dateOfBirth());
        user.setGender(req.gender());

        Device device = new Device();
        device.setUser(user);
        user.setDevice(device);

        NotificationPreference prefs = new NotificationPreference();
        prefs.setUser(user);
        user.setNotificationPreference(prefs);

        user = userRepository.save(user);
        String token = jwtUtil.generateToken(user.getId(), user.getEmail());
        return new AuthResponse(token, user.getEmail(), user.getId());
    }

    public AuthResponse login(LoginRequest req) {
        User user = userRepository.findByEmail(req.email())
                .orElseThrow(() -> new BadRequestException("Invalid email or password"));
        if (!passwordEncoder.matches(req.password(), user.getPassword())) {
            throw new BadRequestException("Invalid email or password");
        }
        String token = jwtUtil.generateToken(user.getId(), user.getEmail());
        return new AuthResponse(token, user.getEmail(), user.getId());
    }
}
