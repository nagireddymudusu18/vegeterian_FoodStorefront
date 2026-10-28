package in.foodapp.order.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRepository extends JpaRepository<Order, UUID> {

    @EntityGraph(attributePaths = "items")
    Optional<Order> findWithItemsById(UUID id);

    @EntityGraph(attributePaths = "items")
    Optional<Order> findWithItemsByOrderNumber(String orderNumber);

    @EntityGraph(attributePaths = "items")
    List<Order> findByCustomerIdOrderByCreatedAtDesc(UUID customerId);

    @EntityGraph(attributePaths = "items")
    List<Order> findByRestaurantIdInAndStatusInOrderByCreatedAtDesc(
            java.util.Collection<UUID> restaurantIds, java.util.Collection<in.foodapp.order.domain.OrderStatus> statuses);

    @EntityGraph(attributePaths = "items")
    List<Order> findByStatusInOrderByCreatedAtDesc(java.util.Collection<in.foodapp.order.domain.OrderStatus> statuses);

    @EntityGraph(attributePaths = "items")
    Optional<Order> findByCustomerIdAndIdempotencyKey(UUID customerId, String idempotencyKey);
}
