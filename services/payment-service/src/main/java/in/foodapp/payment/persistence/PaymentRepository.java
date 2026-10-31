package in.foodapp.payment.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    Optional<Payment> findByCustomerIdAndIdempotencyKey(UUID customerId, String idempotencyKey);

    Optional<Payment> findFirstByGatewayRef(String gatewayRef);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Payment p where p.id = :id")
    Optional<Payment> findByIdForUpdate(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Payment p where p.gatewayRef = :ref order by p.createdAt asc")
    List<Payment> findByGatewayRefForUpdate(@Param("ref") String ref);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Payment p where p.orderId = :orderId order by p.createdAt asc")
    List<Payment> findByOrderIdForUpdate(@Param("orderId") UUID orderId);
}
