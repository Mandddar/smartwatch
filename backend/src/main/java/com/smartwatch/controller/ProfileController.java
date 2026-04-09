package com.smartwatch.controller;

import com.smartwatch.exception.BadRequestException;
import com.smartwatch.exception.NotFoundException;
import com.smartwatch.model.User;
import com.smartwatch.repository.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public ProfileController(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getProfile(Authentication auth) {
        User user = getUser(auth);
        return ResponseEntity.ok(Map.of(
                "id", user.getId(),
                "name", user.getName(),
                "email", user.getEmail(),
                "dateOfBirth", user.getDateOfBirth().toString(),
                "gender", user.getGender() != null ? user.getGender() : "",
                "createdAt", user.getCreatedAt() != null ? user.getCreatedAt().toString() : ""
        ));
    }

    @PutMapping
    public ResponseEntity<Map<String, Object>> updateProfile(
            Authentication auth,
            @RequestBody Map<String, String> body
    ) {
        User user = getUser(auth);

        if (body.containsKey("name") && body.get("name") != null) {
            String name = body.get("name").trim();
            if (name.isEmpty()) throw new BadRequestException("Name cannot be empty");
            user.setName(name);
        }
        if (body.containsKey("gender")) {
            user.setGender(body.get("gender"));
        }
        if (body.containsKey("dateOfBirth") && body.get("dateOfBirth") != null) {
            try {
                user.setDateOfBirth(LocalDate.parse(body.get("dateOfBirth")));
            } catch (Exception e) {
                throw new BadRequestException("Invalid date format. Use YYYY-MM-DD");
            }
        }

        userRepository.save(user);
        return getProfile(auth);
    }

    @PostMapping("/change-password")
    public ResponseEntity<Map<String, String>> changePassword(
            Authentication auth,
            @RequestBody Map<String, String> body
    ) {
        User user = getUser(auth);
        String currentPassword = body.get("currentPassword");
        String newPassword = body.get("newPassword");

        if (currentPassword == null || newPassword == null) {
            throw new BadRequestException("currentPassword and newPassword are required");
        }
        if (!passwordEncoder.matches(currentPassword, user.getPassword())) {
            throw new BadRequestException("Current password is incorrect");
        }
        if (newPassword.length() < 6) {
            throw new BadRequestException("New password must be at least 6 characters");
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "Password changed successfully"));
    }

    @DeleteMapping
    public ResponseEntity<Void> deleteAccount(
            Authentication auth,
            @RequestBody Map<String, String> body
    ) {
        User user = getUser(auth);
        String password = body.get("password");
        if (password == null || !passwordEncoder.matches(password, user.getPassword())) {
            throw new BadRequestException("Password is incorrect");
        }
        userRepository.delete(user);
        return ResponseEntity.noContent().build();
    }

    /** Password reset: no email service, so use security-question-style reset with DOB verification */
    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, String>> resetPassword(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        String dateOfBirth = body.get("dateOfBirth");
        String newPassword = body.get("newPassword");

        if (email == null || dateOfBirth == null || newPassword == null) {
            throw new BadRequestException("email, dateOfBirth, and newPassword are required");
        }
        if (newPassword.length() < 6) {
            throw new BadRequestException("New password must be at least 6 characters");
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new BadRequestException("No account found with that email"));

        try {
            LocalDate dob = LocalDate.parse(dateOfBirth);
            if (!user.getDateOfBirth().equals(dob)) {
                throw new BadRequestException("Date of birth does not match");
            }
        } catch (BadRequestException e) {
            throw e;
        } catch (Exception e) {
            throw new BadRequestException("Invalid date format. Use YYYY-MM-DD");
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "Password reset successfully. You can now login."));
    }

    private User getUser(Authentication auth) {
        Long userId = (Long) auth.getPrincipal();
        return userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));
    }
}
