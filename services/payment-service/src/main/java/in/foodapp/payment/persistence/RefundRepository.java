package in.foodapp.payment.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface RefundRepository extends JpaRepository<Refund, UUID> {

    Optional<Refund> findByPaymentIdAndIdempotencyKey(UUID paymentId, String idempotencyKey);

    Optional<Refund> findFirstByGatewayRef(String gatewayRef);

    @Query("select coalesce(sum(r.amountPaise), 0) from Refund r where r.paymentId = :paymentId and r.status = in.foodapp.payment.domain.RefundStatus.PROCESSED")
    long sumProcessedByPaymentId(@Param("paymentId") UUID paymentId);
}
