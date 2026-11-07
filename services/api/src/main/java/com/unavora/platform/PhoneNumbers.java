package com.unavora.platform;

import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;

/** Normalises Indian mobile numbers (default country +91) to E.164. Rejects anything else rather than guessing. */
public final class PhoneNumbers {
    private static final Pattern E164 = Pattern.compile("^\\+[1-9][0-9]{7,14}$");
    private static final Pattern IN_LOCAL = Pattern.compile("^0?([6-9][0-9]{9})$");
    private static final Pattern IN_91 = Pattern.compile("^91([6-9][0-9]{9})$");

    private PhoneNumbers() {}

    public static String toE164(String raw) {
        String s = raw == null ? "" : raw.replaceAll("[\\s\\-().]", "");
        if (E164.matcher(s).matches()) return s;
        var local = IN_LOCAL.matcher(s);
        if (local.matches()) return "+91" + local.group(1);
        var cc = IN_91.matcher(s);
        if (cc.matches()) return "+91" + cc.group(1);
        throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "invalid_phone", "Enter a valid mobile number");
    }
}
