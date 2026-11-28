package com.ecog.acl.entity;

import org.junit.Test;

import java.util.Date;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class UserTokenTest {

    private static final long NOW = 1700000000000L;

    @Test
    public void validityUsesExplicitAbsoluteTimeAndClosedExpiryBoundary() {
        UserToken token = new UserToken();
        Date now = new Date(NOW);

        token.setExpireTime(null);
        assertFalse(token.isValid(now));

        token.setExpireTime(new Date(NOW - 1));
        assertFalse(token.isValid(now));

        token.setExpireTime(new Date(NOW));
        assertFalse(token.isValid(now));

        token.setExpireTime(new Date(NOW + 1));
        assertTrue(token.isValid(now));
        assertFalse(token.isValid(null));
    }
}
