package in.foodapp.identity.persistence;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AdminInviteRepository extends JpaRepository<AdminInvite, UUID> {

    Optional<AdminInvite> findByTokenHash(String tokenHash);

    @Query("select i from AdminInvite i where i.usedAt is null and i.expiresAt > :now order by i.createdAt desc")
    List<AdminInvite> findPending(@Param("now") Instant now);

    /** Atomic single-use: only one concurrent caller can flip used_at. */
    @Modifying(clearAutomatically = true)
    @Query("update AdminInvite i set i.usedAt = :now where i.tokenHash = :hash and i.usedAt is null "
            + "and i.expiresAt > :now")
    int consume(@Param("hash") String hash, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Query("update AdminInvite i set i.usedAt = :now where i.emailHash = :emailHash and i.usedAt is null")
    int invalidateForEmail(@Param("emailHash") String emailHash, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Query("update AdminInvite i set i.usedAt = :now where i.id = :id and i.usedAt is null")
    int invalidate(@Param("id") UUID id, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Query("delete from AdminInvite i where i.expiresAt < :before")
    int deleteExpiredBefore(@Param("before") Instant before);
}
