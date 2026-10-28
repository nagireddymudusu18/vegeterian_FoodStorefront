package in.foodapp.identity.persistence;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FeatureFlagRepository extends JpaRepository<FeatureFlag, String> {

    List<FeatureFlag> findAllByOrderByKeyAsc();
}
