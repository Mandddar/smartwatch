package com.smartwatch.service;

import com.smartwatch.dto.PreferencesRequest;
import com.smartwatch.dto.PreferencesResponse;
import com.smartwatch.model.NotificationPreference;
import com.smartwatch.repository.NotificationPreferenceRepository;
import com.smartwatch.repository.UserRepository;
import com.smartwatch.exception.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PreferencesService {

    private final NotificationPreferenceRepository prefRepo;
    private final UserRepository userRepository;

    public PreferencesService(NotificationPreferenceRepository prefRepo, UserRepository userRepository) {
        this.prefRepo = prefRepo;
        this.userRepository = userRepository;
    }

    public PreferencesResponse get(Long userId) {
        NotificationPreference p = getOrCreate(userId);
        return new PreferencesResponse(p.isEnableHeartRateAlerts(), p.isEnableGeneralAlerts());
    }

    @Transactional
    public PreferencesResponse update(Long userId, PreferencesRequest req) {
        NotificationPreference p = getOrCreate(userId);
        if (req.enableHeartRateAlerts() != null) p.setEnableHeartRateAlerts(req.enableHeartRateAlerts());
        if (req.enableGeneralAlerts() != null) p.setEnableGeneralAlerts(req.enableGeneralAlerts());
        p = prefRepo.save(p);
        return new PreferencesResponse(p.isEnableHeartRateAlerts(), p.isEnableGeneralAlerts());
    }

    private NotificationPreference getOrCreate(Long userId) {
        return prefRepo.findByUserId(userId)
                .orElseGet(() -> {
                    NotificationPreference np = new NotificationPreference();
                    np.setUser(userRepository.findById(userId).orElseThrow(() -> new NotFoundException("User not found")));
                    return prefRepo.save(np);
                });
    }
}
