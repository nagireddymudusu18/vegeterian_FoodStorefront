package in.foodapp.identity.persistence;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OtpChallengeRepository extends JpaRepository<OtpChallenge, UUID> {

    long countByPhoneHashAndCreatedAtAfter(String phoneHash, Instant after);

    long countByRequestIpAndCreatedAtAfter(String requestIp, Instant after);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from OtpChallenge c where c.phoneHash = :phoneHash and c.consumed = false "
            + "order by c.createdAt desc")
    List<OtpChallenge> lockActiveByPhoneHash(@Param("phoneHash") String phoneHash,
                                             org.springframework.data.domain.Pageable pageable);

    /** Atomically consume a challenge; returns 1 if it was still unconsumed. */
    @Modifying
    @Query("update OtpChallenge c set c.consumed = true where c.id = :id and c.consumed = false")
    int consume(@Param("id") UUID id);

    @Modifying
    @Query("update OtpChallenge c set c.consumed = true where c.phoneHash = :phoneHash and c.consumed = false")
    int consumeAllForPhone(@Param("phoneHash") String phoneHash);

    @Modifying
    @Query("delete from OtpChallenge c where c.createdAt < :before")
    int deleteOlderThan(@Param("before") Instant before);
}
