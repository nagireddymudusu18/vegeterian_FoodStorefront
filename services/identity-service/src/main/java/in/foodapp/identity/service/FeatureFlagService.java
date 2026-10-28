package in.foodapp.identity.service;

import in.foodapp.identity.api.ApiException;
import in.foodapp.identity.persistence.FeatureFlag;
import in.foodapp.identity.persistence.FeatureFlagRepository;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FeatureFlagService {

    private final FeatureFlagRepository flags;
    private final Clock clock;

    public FeatureFlagService(FeatureFlagRepository flags, Clock clock) {
        this.flags = flags;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Map<String, Boolean> snapshot() {
        Map<String, Boolean> out = new LinkedHashMap<>();
        flags.findAllByOrderByKeyAsc().forEach(f -> out.put(f.getKey(), f.isEnabled()));
        return out;
    }

    @Transactional(readOnly = true)
    public List<FeatureFlag> list() {
        return flags.findAllByOrderByKeyAsc();
    }

    /** Unknown flags count as enabled so a missing row never locks users out. */
    @Transactional(readOnly = true)
    public boolean isEnabled(String key) {
        return flags.findById(key).map(FeatureFlag::isEnabled).orElse(true);
    }

    public void require(String key, String what) {
        if (!isEnabled(key)) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Unavailable", what + " is currently unavailable");
        }
    }

    @Transactional
    public FeatureFlag set(String key, boolean enabled, UUID by) {
        FeatureFlag f = flags.findById(key)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not Found", "Unknown flag"));
        f.set(enabled, by, clock.instant());
        return flags.save(f);
    }
}
