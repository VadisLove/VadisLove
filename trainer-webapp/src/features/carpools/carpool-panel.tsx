"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CarFront, MapPin, ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n/i18n-provider";
import { changeCarpool } from "@/app/fahrgemeinschaften/actions";
import type {
  CarpoolRide,
  CarpoolSnapshot,
  RideOperation,
  RideDirection,
} from "@/domain/carpools";
import { parseBerlinCalendarDateTime } from "@/lib/calendar-date-time";
import { carpoolCopy, carpoolErrorText } from "./carpool-copy";
import styles from "./carpool.module.css";

type LoadResult = { data?: CarpoolSnapshot; error?: string };
type Copy = ReturnType<typeof carpoolCopy>;

/** Formulare verwenden wie der Kalender Berliner Ortszeit, unabhängig vom Gerät. */
function localDeparture(value?: string) {
  if (!value) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function readLeg(form: FormData, prefix: string, direction: RideDirection) {
  const value = String(form.get(`${prefix}departure`) || "");
  const [date, time] = value.split("T");
  const departure = parseBerlinCalendarDateTime(date || "", time || "");
  if (!departure) throw new Error("timeInvalid");
  return {
    direction,
    departure_at: departure.toISOString(),
    origin: String(form.get(`${prefix}origin`) || "").trim(),
    meeting_point: String(form.get(`${prefix}meeting`) || "").trim(),
    seats: Number(form.get(`${prefix}seats`)),
    note: String(form.get(`${prefix}note`) || "").trim(),
  };
}
function LegFields({
  prefix,
  copy,
  ride,
}: {
  prefix: string;
  copy: Copy;
  ride?: CarpoolRide;
}) {
  return (
    <div className={styles.fields}>
      <label>
        {copy.origin}
        <input
          name={`${prefix}origin`}
          required
          maxLength={160}
          defaultValue={ride?.origin}
        />
      </label>
      <label>
        {copy.meeting}
        <input
          name={`${prefix}meeting`}
          required
          maxLength={240}
          defaultValue={ride?.meeting_point}
        />
      </label>
      <label>
        {copy.departure}
        <input
          name={`${prefix}departure`}
          type="datetime-local"
          required
          defaultValue={localDeparture(ride?.departure_at)}
        />
      </label>
      <label>
        {copy.seats}
        <input
          name={`${prefix}seats`}
          type="number"
          min={Math.max(1, ride?.confirmed_count || 0)}
          max={50}
          required
          defaultValue={ride?.seats || 3}
        />
      </label>
      <label className={styles.wide}>
        {copy.note}
        <textarea
          name={`${prefix}note`}
          maxLength={500}
          rows={2}
          defaultValue={ride?.note}
        />
      </label>
    </div>
  );
}

/** Ein Bereich für Termindetails, Deep-Links und Einstellungen. Kein lokaler
 * Buchungszustand: Nach jeder Mutation wird der autorisierte Snapshot geladen. */
export function CarpoolPanel({
  eventId,
  rideId,
  initial,
  settingsOnly = false,
}: {
  eventId?: string;
  rideId?: string;
  initial?: LoadResult;
  settingsOnly?: boolean;
}) {
  const { locale } = useI18n();
  const copy = carpoolCopy(locale);
  const [result, setResult] = useState<LoadResult | undefined>(initial);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<"offer" | "wanted" | null>(null);
  const [returnRide, setReturnRide] = useState(false);
  const [direction, setDirection] = useState<RideDirection>("outbound");
  const [editing, setEditing] = useState<string | null>(null);
  const retryCommand = useRef<{ fingerprint: string; id: string } | null>(null);
  const [filterDirection, setFilterDirection] = useState<RideDirection | "all">(
    "all",
  );
  const [filterOrigin, setFilterOrigin] = useState("");
  const query = new URLSearchParams({
    ...(eventId ? { event: eventId } : {}),
    ...(rideId ? { ride: rideId } : {}),
  }).toString();
  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(`/api/carpools?${query}`, {
        cache: "no-store",
        signal,
      });
      const loaded = (await response.json()) as LoadResult;
      setResult(loaded);
    },
    [query],
  );
  useEffect(() => {
    if (initial) return;
    const controller = new AbortController();
    fetch(`/api/carpools?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((loaded: LoadResult) => setResult(loaded))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ error: "failed" });
      });
    return () => controller.abort();
  }, [initial, query]);

  function run(
    operation: RideOperation,
    payload: Record<string, unknown>,
    onSuccess?: () => void,
  ) {
    if (pending) return;
    const fingerprint = JSON.stringify({ operation, payload });
    // Bei verloren gegangener Antwort denselben Befehl wiederverwenden.
    if (retryCommand.current?.fingerprint !== fingerprint)
      retryCommand.current = { fingerprint, id: crypto.randomUUID() };
    const id = retryCommand.current.id;
    startTransition(async () => {
      try {
        const response = await changeCarpool(id, operation, payload);
        if (response.error) {
          setMessage(carpoolErrorText(response.error, locale));
          return;
        }
        retryCommand.current = null;
        setMessage(copy.saved);
        onSuccess?.();
        await reload();
      } catch {
        setMessage(copy.failed);
      }
    });
  }
  const data = result?.data;
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
      timeZone: "Europe/Berlin",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  const offerSubmit = (values: FormData, ride?: CarpoolRide) => {
    try {
      const leg = readLeg(values, "", ride?.direction || direction);
      if (ride)
        run("edit", { ...leg, ride_id: ride.id, revision: ride.revision }, () =>
          setEditing(null),
        );
      else
        run(
          "offer",
          {
            event_id: eventId,
            attested: values.get("attested") === "on",
            legs: [
              leg,
              ...(returnRide ? [readLeg(values, "return_", "return")] : []),
            ],
          },
          () => {
            setForm(null);
            setReturnRide(false);
          },
        );
    } catch {
      setMessage(copy.timeInvalid);
    }
  };
  if (!result) return <p role="status">{copy.loading}</p>;
  if (!data)
    return (
      <section className={styles.panel}>
        <p role="alert">{carpoolErrorText(result.error || "failed", locale)}</p>
        <button
          type="button"
          onClick={() => reload().catch(() => setResult({ error: "failed" }))}
        >
          {copy.retry}
        </button>
      </section>
    );

  return (
    <section
      className={styles.panel}
      aria-label={settingsOnly ? copy.settings : copy.title}
      aria-busy={pending}
    >
      <p role="status" className={styles.feedback}>
        {pending ? copy.working : message}
      </p>
      {settingsOnly ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            run("preferences", {
              own_app: values.get("own_app") === "on",
              own_email: values.get("own_email") === "on",
              guardian_app: values.get("guardian_app") === "on",
              guardian_email: values.get("guardian_email") === "on",
              locale,
            });
          }}
        >
          <fieldset disabled={pending}>
            <legend>{copy.settings}</legend>
            <p>{copy.settingsHint}</p>
            {(
              [
                "own_app",
                "own_email",
                "guardian_app",
                "guardian_email",
              ] as const
            ).map((key) => (
              <label className={styles.check} key={key}>
                <input
                  type="checkbox"
                  name={key}
                  defaultChecked={data.preferences[key]}
                />
                {copy[key]}
              </label>
            ))}
            <button type="submit">{copy.save}</button>
          </fieldset>
        </form>
      ) : (
        <>
          <header className={styles.header}>
            <CarFront aria-hidden="true" />
            <h2>{copy.title}</h2>
          </header>
          {data.canUseEvent && eventId && (
            <div className={styles.actions}>
              <button
                type="button"
                onClick={() => {
                  setForm("offer");
                  setDirection("outbound");
                }}
                disabled={pending || !data.canOffer}
              >
                {copy.offer}
              </button>
              <button
                type="button"
                onClick={() => setForm("wanted")}
                disabled={pending}
              >
                {copy.wanted}
              </button>
            </div>
          )}
          {data.canUseEvent && !data.canOffer && <p>{copy.adultHint}</p>}
          {form && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const values = new FormData(event.currentTarget);
                if (form === "offer") offerSubmit(values);
                else
                  run(
                    "wanted",
                    {
                      event_id: eventId,
                      direction: values.get("direction"),
                      origin: values.get("origin"),
                      note: values.get("note"),
                    },
                    () => setForm(null),
                  );
              }}
              className={styles.form}
            >
              <fieldset disabled={pending}>
                <legend>{form === "offer" ? copy.offer : copy.wanted}</legend>
                <label>
                  {copy.direction}
                  <select
                    name="direction"
                    value={direction}
                    onChange={(e) => {
                      setDirection(e.target.value as RideDirection);
                      setReturnRide(false);
                    }}
                  >
                    <option value="outbound">{copy.outbound}</option>
                    <option value="return">{copy.return}</option>
                  </select>
                </label>
                {form === "offer" ? (
                  <>
                    <LegFields prefix="" copy={copy} />
                    {direction === "outbound" && (
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={returnRide}
                          onChange={(e) => setReturnRide(e.target.checked)}
                        />
                        {copy.addReturn}
                      </label>
                    )}
                    {returnRide && (
                      <fieldset>
                        <legend>{copy.return}</legend>
                        <LegFields prefix="return_" copy={copy} />
                      </fieldset>
                    )}
                    <label className={styles.check}>
                      <input type="checkbox" name="attested" required />
                      {copy.attested}
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      {copy.origin}
                      <input name="origin" maxLength={160} required />
                    </label>
                    <label>
                      {copy.note}
                      <textarea name="note" maxLength={500} />
                    </label>
                  </>
                )}
                <div className={styles.actions}>
                  <button type="submit">{copy.save}</button>
                  <button type="button" onClick={() => setForm(null)}>
                    {copy.cancel}
                  </button>
                </div>
              </fieldset>
            </form>
          )}
          <h3>{copy.offers}</h3>
          {data.rides.length > 0 && (
            <div className={styles.fields}>
              <label>
                {copy.direction}
                <select
                  value={filterDirection}
                  onChange={(event) =>
                    setFilterDirection(
                      event.target.value as RideDirection | "all",
                    )
                  }
                >
                  <option value="all">{copy.allDirections}</option>
                  <option value="outbound">{copy.outbound}</option>
                  <option value="return">{copy.return}</option>
                </select>
              </label>
              <label>
                {copy.filterOrigin}
                <input
                  type="search"
                  value={filterOrigin}
                  onChange={(event) => setFilterOrigin(event.target.value)}
                />
              </label>
              {(filterDirection !== "all" || filterOrigin) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterDirection("all");
                    setFilterOrigin("");
                  }}
                >
                  {copy.clearFilters}
                </button>
              )}
            </div>
          )}
          {data.rides.length > 0 &&
            !data.rides.some(
              (ride) =>
                (filterDirection === "all" ||
                  ride.direction === filterDirection) &&
                ride.origin
                  .toLocaleLowerCase()
                  .includes(filterOrigin.trim().toLocaleLowerCase()),
            ) && <p>{copy.noMatches}</p>}
          {data.rides.length === 0 && (
            <p className={styles.empty}>
              {rideId ? copy.noAccess : copy.empty}
            </p>
          )}
          {data.rides
            .filter(
              (ride) =>
                (filterDirection === "all" ||
                  ride.direction === filterDirection) &&
                ride.origin
                  .toLocaleLowerCase()
                  .includes(filterOrigin.trim().toLocaleLowerCase()),
            )
            .map((ride) => {
              const isDriver = ride.driver_id === data.userId;
              const isDeparted =
                new Date(ride.departure_at).getTime() <=
                new Date(data.asOf).getTime();
              const activeRequest = data.rides.some(
                (r) =>
                  r.event_id === ride.event_id &&
                  r.direction === ride.direction &&
                  r.requests.some(
                    (q) =>
                      q.passenger_id === data.userId &&
                      ["pending", "confirmed"].includes(q.status),
                  ),
              );
              return (
                <article className={styles.ride} key={ride.id}>
                  <div className={styles.header}>
                    <span className={styles.direction}>
                      {copy[ride.direction]}
                    </span>
                    <span>{copy[ride.status]}</span>
                  </div>
                  <h4>
                    <MapPin size={17} aria-hidden="true" />
                    {ride.origin}
                    <ArrowRight size={16} aria-hidden="true" />
                    {ride.meeting_point}
                  </h4>
                  <time dateTime={ride.departure_at}>
                    {formatTime(ride.departure_at)} · Europe/Berlin
                  </time>
                  <p>
                    {copy.driver}: <strong>{ride.driver_name}</strong>
                    {isDriver ? ` · ${copy.mine}` : ""}
                  </p>
                  <p className={styles.capacity}>
                    {Math.max(0, ride.seats - ride.confirmed_count)} /{" "}
                    {ride.seats} {copy.free}
                  </p>
                  {ride.note && <p className={styles.note}>{ride.note}</p>}
                  {ride.status === "review" && (
                    <p className={styles.notice}>{copy.reviewNotice}</p>
                  )}
                  {isDeparted && <p>{copy.departed}</p>}
                  {!isDriver &&
                    ride.can_request &&
                    ride.status === "active" &&
                    !isDeparted && (
                      <button
                        type="button"
                        disabled={
                          pending ||
                          activeRequest ||
                          ride.confirmed_count >= ride.seats
                        }
                        onClick={() => run("request", { ride_id: ride.id })}
                      >
                        {copy.request}
                      </button>
                    )}
                  {isDriver && ride.status !== "cancelled" && (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          setEditing(editing === ride.id ? null : ride.id)
                        }
                      >
                        {copy.edit}
                      </button>
                      {ride.status === "review" && (
                        <button
                          type="button"
                          disabled={pending || isDeparted}
                          onClick={() =>
                            run("review", {
                              ride_id: ride.id,
                              revision: ride.revision,
                            })
                          }
                        >
                          {copy.reviewAction}
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.danger}
                        disabled={pending}
                        onClick={() => {
                          if (window.confirm(copy.confirmCancel))
                            run("cancel_ride", { ride_id: ride.id });
                        }}
                      >
                        {copy.cancelRide}
                      </button>
                    </div>
                  )}
                  {editing === ride.id && (
                    <form
                      className={styles.form}
                      onSubmit={(event) => {
                        event.preventDefault();
                        offerSubmit(new FormData(event.currentTarget), ride);
                      }}
                    >
                      <fieldset disabled={pending}>
                        <legend>{copy.edit}</legend>
                        <LegFields prefix="" copy={copy} ride={ride} />
                        <div className={styles.actions}>
                          <button type="submit">{copy.save}</button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                          >
                            {copy.cancel}
                          </button>
                        </div>
                      </fieldset>
                    </form>
                  )}
                  {ride.requests.length > 0 && (
                    <div className={styles.requests}>
                      <h5>{copy.requests}</h5>
                      {ride.requests.map((q) => (
                        <div key={q.id} className={styles.request}>
                          <p>
                            <strong>{q.passenger_name}</strong> ·{" "}
                            {copy[q.status]}
                            {q.passenger_id === data.userId
                              ? ` · ${copy.own}`
                              : ""}
                          </p>
                          {q.status === "confirmed" && (
                            <p>
                              {q.acknowledged_revision >= ride.revision
                                ? copy.acknowledged
                                : copy.waitingAck}
                            </p>
                          )}
                          <div className={styles.actions}>
                            {isDriver && q.status === "pending" && (
                              <>
                                <button
                                  type="button"
                                  disabled={
                                    pending ||
                                    isDeparted ||
                                    ride.status !== "active" ||
                                    ride.confirmed_count >= ride.seats
                                  }
                                  onClick={() =>
                                    run("confirm", {
                                      ride_id: ride.id,
                                      request_id: q.id,
                                    })
                                  }
                                >
                                  {copy.confirm}
                                </button>
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() =>
                                    run("decline", {
                                      ride_id: ride.id,
                                      request_id: q.id,
                                    })
                                  }
                                >
                                  {copy.decline}
                                </button>
                              </>
                            )}
                            {(isDriver || q.passenger_id === data.userId) &&
                              ["pending", "confirmed"].includes(q.status) && (
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => {
                                    if (
                                      window.confirm(copy.confirmBookingCancel)
                                    )
                                      run("cancel_request", {
                                        ride_id: ride.id,
                                        request_id: q.id,
                                      });
                                  }}
                                >
                                  {copy.cancelRequest}
                                </button>
                              )}
                            {q.passenger_id === data.userId &&
                              q.status === "confirmed" &&
                              q.acknowledged_revision < ride.revision && (
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() =>
                                    run("acknowledge", {
                                      ride_id: ride.id,
                                      request_id: q.id,
                                      revision: ride.revision,
                                    })
                                  }
                                >
                                  {copy.acknowledge}
                                </button>
                              )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {ride.can_comment && (
                    <details className={styles.comments}>
                      <summary>
                        {copy.comments} ({ride.comments.length})
                      </summary>
                      {ride.comments.map((c) => (
                        <div key={c.id}>
                          <strong>{c.author_name}</strong>
                          <small> · {formatTime(c.created_at)}</small>
                          <p>{c.body}</p>
                        </div>
                      ))}
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          const element = event.currentTarget;
                          const values = new FormData(element);
                          run(
                            "comment",
                            { ride_id: ride.id, body: values.get("body") },
                            () => element.reset(),
                          );
                        }}
                      >
                        <label>
                          {copy.comment}
                          <textarea
                            name="body"
                            required
                            maxLength={500}
                            rows={2}
                          />
                        </label>
                        <button type="submit" disabled={pending}>
                          {copy.send}
                        </button>
                      </form>
                    </details>
                  )}
                </article>
              );
            })}
          {data.canUseEvent && (
            <>
              <h3>{copy.searches}</h3>
              {!data.wanted.length && <p>{copy.noSearches}</p>}
              {data.wanted.map((w) => (
                <article key={w.id} className={styles.request}>
                  <strong>{w.user_name}</strong>
                  <p>
                    {copy[w.direction]} · {w.origin}
                  </p>
                  {w.note && <p>{w.note}</p>}
                  <button
                    type="button"
                    onClick={() => {
                      setFilterDirection(w.direction);
                      setFilterOrigin(w.origin);
                    }}
                  >
                    {copy.matchOffers}
                  </button>
                  {w.user_id === data.userId && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run("remove_wanted", {
                          event_id: eventId,
                          direction: w.direction,
                        })
                      }
                    >
                      {copy.deleteWanted}
                    </button>
                  )}
                </article>
              ))}
            </>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => reload().catch(() => setMessage(copy.failed))}
          >
            {copy.retry}
          </button>
        </>
      )}
    </section>
  );
}
