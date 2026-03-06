const AUTH_KEY = "slotBookingUser";
const PUBLIC_PAGES = ["/login.html", "/register.html"];

function normalizePath(path) {
    if (!path || path === "/") return "/index.html";
    if (path === "/login") return "/login.html";
    if (path === "/register") return "/register.html";
    if (path === "/index") return "/index.html";
    return path;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function getPathname() {
    return normalizePath(window.location.pathname);
}

function getCurrentUser() {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function setCurrentUser(user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

function clearCurrentUser() {
    localStorage.removeItem(AUTH_KEY);
}

function requireAuth() {
    const path = getPathname();
    const isPublic = PUBLIC_PAGES.includes(path);
    const user = getCurrentUser();

    if (!user && !isPublic) {
        window.location.replace("/login.html");
        return null;
    }

    if (user && isPublic) {
        window.location.replace("/");
        return null;
    }

    return user;
}

function setupLogout() {
    const logoutBtn = document.getElementById("logoutBtn");
    if (!logoutBtn) return;

    logoutBtn.addEventListener("click", (event) => {
        event.preventDefault();
        clearCurrentUser();
        window.location.href = "/login.html";
    });
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const raw = await response.text();
    let data = null;

    if (raw) {
        try {
            data = JSON.parse(raw);
        } catch {
            data = null;
        }
    }

    if (!response.ok) {
        const fallbackMessage =
            raw && data === null
                ? "API returned a non-JSON response. Check backend deployment and /api redirect."
                : "Something went wrong";
        throw new Error(
            (data && (data.error || data.detail || data.message)) || fallbackMessage
        );
    }

    if (data === null) {
        throw new Error(
            "API returned an empty response. Check backend deployment and /api redirect."
        );
    }

    return data;
}

function toDate(value) {
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);
    if (typeof value !== "string") return new Date(NaN);

    const trimmed = value.trim();
    if (!trimmed) return new Date(NaN);

    let parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;

    parsed = new Date(trimmed.replace(" ", "T"));
    if (!Number.isNaN(parsed.getTime())) return parsed;

    parsed = new Date(trimmed.replace(" ", "T").replace(/\.\d+$/, ""));
    if (!Number.isNaN(parsed.getTime())) return parsed;

    // Handles time-only values from some MySQL schemas (e.g. "10:05:00").
    const timeOnly = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeOnly) {
        const now = new Date();
        now.setHours(
            Number(timeOnly[1]),
            Number(timeOnly[2]),
            Number(timeOnly[3] || 0),
            0
        );
        return now;
    }

    // Handles "09:00 AM" / "12:30 PM" values.
    const ampm = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
    if (ampm) {
        let hours = Number(ampm[1]);
        const minutes = Number(ampm[2]);
        const meridian = ampm[3].toUpperCase();
        if (meridian === "PM" && hours < 12) hours += 12;
        if (meridian === "AM" && hours === 12) hours = 0;
        const now = new Date();
        now.setHours(hours, minutes, 0, 0);
        return now;
    }

    return new Date(NaN);
}

function formatTime(value) {
    const dt = toDate(value);
    if (Number.isNaN(dt.getTime())) return "Time unavailable";
    return dt.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
    });
}

function formatLongDate(value) {
    if (
        typeof value === "string" &&
        (/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.test(value.trim()) ||
            /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/.test(value.trim()))
    ) {
        return "Today";
    }
    const dt = toDate(value);
    if (Number.isNaN(dt.getTime())) return "Date unavailable";
    return dt.toLocaleDateString([], {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

function formatDateTime(value) {
    const dt = toDate(value);
    if (Number.isNaN(dt.getTime())) return "Date unavailable";
    return dt.toLocaleString();
}

function buildSlotCard(slot, isBooked) {
    const safeId = Number(slot.id || 0);
    const time = formatTime(slot.slot_time);
    const date = formatLongDate(slot.slot_time);
    const badgeClass = isBooked ? "booked" : "available";
    const badgeText = isBooked ? "Booked" : "Available";
    const actionClass = isBooked ? "btn-danger booked-btn" : "";
    const actionText = isBooked ? "Booked" : "Book Now";
    const actionHtml = isBooked
        ? `<button class="btn slot-action ${actionClass}" disabled>${actionText}</button>`
        : `<a class="btn slot-action ${actionClass}" href="/book.html?slot_id=${safeId}">${actionText}</a>`;

    return `
        <article class="slot-card">
            <h3 class="slot-time">${escapeHtml(time)}</h3>
            <p class="slot-date">${escapeHtml(date)}</p>
            <span class="badge ${badgeClass}">${badgeText}</span>
            ${actionHtml}
        </article>
    `;
}

async function loadSlotsList() {
    const slotsGrid = document.getElementById("slotsGrid");
    if (!slotsGrid) return;

    try {
        const [availableSlots, bookedSlots] = await Promise.all([
            fetchJson("/api/slots"),
            fetchJson("/api/bookings"),
        ]);

        const available = (availableSlots || []).map((slot) => ({
            id: slot.id,
            slot_time: slot.slot_time,
            is_booked: false,
        }));

        const booked = (bookedSlots || []).map((booking) => ({
            id: booking.id,
            slot_time: booking.slot_time,
            is_booked: true,
        }));

        const combined = [...booked, ...available].sort(
            (a, b) => toDate(a.slot_time) - toDate(b.slot_time)
        );

        if (!combined.length) {
            slotsGrid.innerHTML = '<div class="slot-card empty">No slots found.</div>';
            return;
        }

        slotsGrid.innerHTML = combined
            .map((slot) => buildSlotCard(slot, slot.is_booked))
            .join("");
    } catch (error) {
        slotsGrid.innerHTML = `<div class="slot-card empty">${escapeHtml(
            error.message
        )}</div>`;
    }
}

function setPreselectedSlot() {
    const slotSelect = document.getElementById("slot");
    if (!slotSelect) return;

    const params = new URLSearchParams(window.location.search);
    const selectedId = params.get("slot_id");
    if (!selectedId) return;

    const option = slotSelect.querySelector(`option[value="${selectedId}"]`);
    if (option) {
        slotSelect.value = selectedId;
    }
}

function populateBookingUser(user) {
    const nameNode = document.getElementById("bookingUserName");
    const emailNode = document.getElementById("bookingUserEmail");
    if (nameNode) nameNode.textContent = user?.name || "-";
    if (emailNode) emailNode.textContent = user?.email || "-";
}

async function loadBookingFormSlots() {
    const slotSelect = document.getElementById("slot");
    if (!slotSelect) return;

    try {
        const slots = await fetchJson("/api/slots");
        if (!slots.length) {
            slotSelect.innerHTML = "<option value=''>No slots available</option>";
            slotSelect.disabled = true;
            return;
        }
        slotSelect.disabled = false;
        slotSelect.innerHTML = slots
            .map(
                (slot) =>
                    `<option value="${slot.id}">${escapeHtml(
                        `${formatLongDate(slot.slot_time)} - ${formatTime(slot.slot_time)}`
                    )}</option>`
            )
            .join("");
        setPreselectedSlot();
    } catch (error) {
        slotSelect.innerHTML = `<option value=''>${escapeHtml(error.message)}</option>`;
        slotSelect.disabled = true;
    }
}

async function handleBookingSubmit(user) {
    const form = document.getElementById("bookingForm");
    if (!form) return;

    const message = document.getElementById("bookingMessage");
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.textContent = "Submitting booking...";

        const slotId = document.getElementById("slot").value;

        try {
            const result = await fetchJson("/api/book", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    slot_id: Number(slotId),
                    user_name: user.name,
                    user_email: user.email,
                }),
            });
            message.textContent = result.message;
            await loadBookingFormSlots();
        } catch (error) {
            message.textContent = error.message;
        }
    });
}

async function loadBookingsList() {
    const bookingsList = document.getElementById("bookingsList");
    if (!bookingsList) return;

    try {
        const bookings = await fetchJson("/api/bookings");
        if (!bookings.length) {
            bookingsList.innerHTML = '<article class="booking-card empty">No bookings yet.</article>';
            return;
        }
        bookingsList.innerHTML = bookings
            .map(
                (booking) => `
                    <article class="booking-card">
                        <h3>${escapeHtml(formatDateTime(booking.slot_time))}</h3>
                        <p><strong>${escapeHtml(booking.user_name)}</strong></p>
                        <p>${escapeHtml(booking.user_email)}</p>
                    </article>
                `
            )
            .join("");
    } catch (error) {
        bookingsList.innerHTML = `<article class="booking-card empty">${escapeHtml(
            error.message
        )}</article>`;
    }
}

function setupLoginForm() {
    const form = document.getElementById("loginForm");
    if (!form) return;

    const message = document.getElementById("loginMessage");
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.textContent = "Signing in...";

        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;

        try {
            const data = await fetchJson("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            setCurrentUser(data.user);
            window.location.href = "/";
        } catch (error) {
            message.textContent = error.message;
        }
    });
}

function setupRegisterForm() {
    const form = document.getElementById("registerForm");
    if (!form) return;

    const message = document.getElementById("registerMessage");
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.textContent = "Creating account...";

        const name = document.getElementById("registerName").value.trim();
        const email = document.getElementById("registerEmail").value.trim();
        const password = document.getElementById("registerPassword").value;

        try {
            await fetchJson("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });
            message.textContent = "Account created. Redirecting to login...";
            setTimeout(() => {
                window.location.href = "/login.html";
            }, 900);
        } catch (error) {
            message.textContent = error.message;
        }
    });
}

function setupHomeUser(user) {
    const node = document.getElementById("currentUserName");
    if (node && user) {
        node.textContent = user.name;
    }
}

(function init() {
    const path = getPathname();
    const isPublic = PUBLIC_PAGES.includes(path);
    const user = requireAuth();

    if (isPublic) {
        setupLoginForm();
        setupRegisterForm();
        return;
    }
    if (!user) return;

    setupLogout();
    setupHomeUser(user);
    populateBookingUser(user);

    loadSlotsList();
    loadBookingFormSlots();
    handleBookingSubmit(user);
    loadBookingsList();
})();
