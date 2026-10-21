"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createSubscriptionRequestSchema,
  roleSatisfies,
  type PlanDto,
  type SubscriptionDto,
  type UsageSummaryResponse,
} from "@ovozai/contracts";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ovozai/ui";
import { useAuth } from "@/lib/auth-context";
import { createSubscription, getSubscription, getUsage, listPlans } from "@/lib/billing-api";
import { describeError } from "@/lib/form";
import { formatDateTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { SelectField } from "@/components/select-field";
import { SubscriptionStatusBadge } from "@/components/subscription-status-badge";

const integerFormatter = new Intl.NumberFormat("en-US");

function formatLimitValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function PlanLimits({ limits }: { limits: PlanDto["limits"] }) {
  const entries = limits ? Object.entries(limits) : [];
  if (entries.length === 0) {
    return <span className="text-xs text-muted-foreground">No usage limits</span>;
  }
  return (
    <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      {entries.map(([key, value]) => (
        <li key={key}>
          <span className="font-medium text-foreground">{key}</span>: {formatLimitValue(value)}
        </li>
      ))}
    </ul>
  );
}

function ChangePlanForm({
  plans,
  current,
  onChanged,
}: {
  plans: PlanDto[];
  current: SubscriptionDto | null;
  onChanged: () => void;
}) {
  const activePlans = plans.filter((plan) => plan.active);
  const [planCode, setPlanCode] = useState<string>(
    () => current?.planCode ?? activePlans[0]?.code ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isChange = current !== null;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    const parsed = createSubscriptionRequestSchema.safeParse({ planCode });
    if (!parsed.success) {
      setFormError("Select a plan first.");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await createSubscription(parsed.data);
      setSuccess(`This organization is now on the ${updated.planCode} plan.`);
      onChanged();
    } catch (err) {
      setFormError(describeError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isChange ? "Change plan" : "Subscribe to a plan"}</CardTitle>
        <CardDescription>
          {isChange
            ? "Move this organization to a different plan."
            : "Choose a plan to activate billing for this organization."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-4 sm:max-w-sm" onSubmit={onSubmit} noValidate>
          <SelectField
            label="Plan"
            name="planCode"
            value={planCode}
            onChange={(e) => setPlanCode(e.target.value)}
          >
            {activePlans.length === 0 ? <option value="">No plans available</option> : null}
            {activePlans.map((plan) => (
              <option key={plan.id} value={plan.code}>
                {plan.name} — {formatMoney(plan.priceCents, plan.currency)}
              </option>
            ))}
          </SelectField>
          <div>
            <Button type="submit" disabled={submitting || activePlans.length === 0}>
              {submitting ? "Saving…" : isChange ? "Change plan" : "Subscribe"}
            </Button>
          </div>
        </form>

        {formError ? <Alert variant="destructive">{formError}</Alert> : null}
        {success ? <Alert variant="success">{success}</Alert> : null}
      </CardContent>
    </Card>
  );
}

function UsageCard({
  usage,
  loading,
}: {
  usage: UsageSummaryResponse | null;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage</CardTitle>
        <CardDescription>
          {usage ? `Billing period ${usage.periodKey}` : "Current billing period"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loading && !usage ? (
          <p className="text-sm text-muted-foreground">Loading usage…</p>
        ) : !usage || usage.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No usage recorded for this period yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Metric</th>
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 text-right font-medium">Quantity</th>
                  <th className="px-3 py-2 text-right font-medium">Raw count</th>
                </tr>
              </thead>
              <tbody>
                {usage.items.map((item) => (
                  <tr key={item.metric} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium">{item.metric}</td>
                    <td className="px-3 py-2">{item.periodKey}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {integerFormatter.format(item.quantity)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {integerFormatter.format(item.rawCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function BillingPage() {
  const { activeRole } = useAuth();
  const isAdmin = activeRole ? roleSatisfies(activeRole, "ADMIN") : false;
  const isOwner = activeRole ? roleSatisfies(activeRole, "OWNER") : false;

  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionDto | null>(null);
  const [usage, setUsage] = useState<UsageSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      // Plans are visible to any member; the subscription and usage are
      // ADMIN-only, so skip those calls for VIEWER/MEMBER to avoid 403s.
      const [planList, sub, usageSummary] = await Promise.all([
        listPlans(),
        isAdmin ? getSubscription() : Promise.resolve(null),
        isAdmin ? getUsage() : Promise.resolve(null),
      ]);
      setPlans(planList);
      setSubscription(sub);
      setUsage(usageSummary);
    } catch (err) {
      setLoadError(describeError(err).message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing &amp; usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review available plans, this organization&rsquo;s subscription, and current usage.
        </p>
      </div>

      {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Available plans</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loading && plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading plans…</p>
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No plans are available right now.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {plans.map((plan) => {
                const isCurrent = subscription?.planCode === plan.code;
                return (
                  <li
                    key={plan.id}
                    className="flex flex-col gap-2 rounded-md border border-border px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{plan.name}</span>
                      {isCurrent ? <Badge variant="success">Current</Badge> : null}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatMoney(plan.priceCents, plan.currency)}
                    </span>
                    <PlanLimits limits={plan.limits} />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Current subscription</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {loading && !subscription ? (
              <p className="text-sm text-muted-foreground">Loading subscription…</p>
            ) : subscription ? (
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{subscription.planCode}</span>
                  <SubscriptionStatusBadge status={subscription.status} />
                </div>
                <span className="text-muted-foreground">
                  Current period: {formatDateTime(subscription.currentPeriodStart)} –{" "}
                  {formatDateTime(subscription.currentPeriodEnd)}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active subscription.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {isOwner && !loading ? (
        <ChangePlanForm plans={plans} current={subscription} onChanged={reload} />
      ) : null}

      {isAdmin ? <UsageCard usage={usage} loading={loading} /> : null}
    </div>
  );
}
