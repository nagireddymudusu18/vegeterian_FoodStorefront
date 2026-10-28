package in.foodapp.order.persistence;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MenuItemReplicaRepository extends JpaRepository<MenuItemReplica, UUID> {
}
