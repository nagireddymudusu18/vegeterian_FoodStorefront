package in.foodapp.order.persistence;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RestaurantReplicaRepository extends JpaRepository<RestaurantReplica, UUID> {

    java.util.List<RestaurantReplica> findByOwnerUserId(UUID ownerUserId);
}
