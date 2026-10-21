"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createInvitationRequestSchema,
  invitableRoleSchema,
  membershipRoleSchema,
  roleSatisfies,
  type InvitableRole,
  type InvitationCreatedDto,
  type MembershipRole,
  type MembershipWithUserDto,
} from "@ovozai/contracts";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ovozai/ui";
import { useAuth } from "@/lib/auth-context";
import {
  createInvitation,
  listMemberships,
  removeMembership,
  updateMembershipRole,
  type PaginatedResult,
} from "@/lib/auth-api";
import { describeError, zodFieldErrors, type FieldErrors } from "@/lib/form";
import { FormField } from "@/components/form-field";
import { RoleBadge } from "@/components/role-badge";
import { CopyField } from "@/components/copy-field";

const ALL_ROLES: readonly MembershipRole[] = membershipRoleSchema.options;
const INVITABLE_ROLES: readonly InvitableRole[] = invitableRoleSchema.options;

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("MEMBER");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<InvitationCreatedDto | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setCreated(null);

    const parsed = createInvitationRequestSchema.safeParse({ email, role });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      const invitation = await createInvitation(parsed.data);
      setCreated(invitation);
      setEmail("");
      setRole("MEMBER");
      onInvited();
    } catch (error) {
      const described = describeError(error);
      setFormError(described.message);
      setFieldErrors(described.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  };

  const acceptLink =
    created && typeof window !== "undefined"
      ? `${window.location.origin}/dashboard/accept-invite?token=${created.token}`
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite a member</CardTitle>
        <CardDescription>
          Invitations are accepted via a one-time link. The token is shown once — share it
          now.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={onSubmit} noValidate>
          <div className="flex-1">
            <FormField
              label="Email"
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-role" className="text-sm font-medium leading-none">
              Role
            </label>
            <select
              id="invite-role"
              name="role"
              value={role}
              onChange={(e) => setRole(invitableRoleSchema.parse(e.target.value))}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {INVITABLE_ROLES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Inviting…" : "Send invite"}
          </Button>
        </form>

        {formError ? <Alert variant="destructive">{formError}</Alert> : null}

        {created ? (
          <Alert variant="success" className="flex flex-col gap-2">
            <span className="font-medium">
              Invitation created for {created.email} ({created.role}).
            </span>
            <span className="text-xs">
              This token is shown only once. Share the accept link below with the invitee.
            </span>
            <CopyField label="Invite token" value={created.token} />
            {acceptLink ? <CopyField label="Accept link" value={acceptLink} /> : null}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface MemberRowProps {
  membership: MembershipWithUserDto;
  canManage: boolean;
  isOwner: boolean;
  isSelf: boolean;
  onChanged: () => void;
}

function MemberRow({ membership, canManage, isOwner, isSelf, onChanged }: MemberRowProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only an OWNER may modify an OWNER membership.
  const targetIsOwner = membership.role === "OWNER";
  const lockedByOwnership = targetIsOwner && !isOwner;
  const controlsDisabled = busy || lockedByOwnership;

  const onRoleChange = async (role: MembershipRole) => {
    if (role === membership.role) return;
    setError(null);
    setBusy(true);
    try {
      await updateMembershipRole(membership.id, role);
      onChanged();
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setError(null);
    setBusy(true);
    try {
      await removeMembership(membership.id);
      onChanged();
    } catch (err) {
      setError(describeError(err).message);
      setBusy(false);
    }
  };

  // An OWNER option is only selectable by an existing OWNER.
  const roleOptions = ALL_ROLES.filter((role) => role !== "OWNER" || isOwner);

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-medium">
            {membership.user.name ?? membership.user.email}
            {isSelf ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}
          </span>
          <span className="text-xs text-muted-foreground">{membership.user.email}</span>
        </div>
        <div className="flex items-center gap-2">
          {canManage && !lockedByOwnership ? (
            <select
              aria-label={`Role for ${membership.user.email}`}
              value={membership.role}
              disabled={controlsDisabled}
              onChange={(e) => void onRoleChange(membershipRoleSchema.parse(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {roleOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <RoleBadge role={membership.role} />
          )}
          {canManage ? (
            <Button
              variant="outline"
              size="sm"
              disabled={controlsDisabled || isSelf}
              onClick={() => void onRemove()}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </li>
  );
}

export default function MembersPage() {
  const { user, activeRole } = useAuth();
  const canManage = activeRole ? roleSatisfies(activeRole, "ADMIN") : false;
  const isOwner = activeRole === "OWNER";

  const [members, setMembers] = useState<MembershipWithUserDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    setLoadError(null);
    try {
      const result: PaginatedResult<MembershipWithUserDto> = await listMemberships(
        cursor ? { cursor } : undefined,
      );
      setMembers((prev) => (cursor ? [...prev, ...result.data] : result.data));
      setNextCursor(result.pageInfo.hasNextPage ? result.pageInfo.nextCursor : null);
    } catch (err) {
      setLoadError(describeError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          People with access to this organization.
        </p>
      </div>

      {canManage ? <InviteForm onInvited={reload} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}
          {loading && members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading members…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {members.map((membership) => (
                <MemberRow
                  key={membership.id}
                  membership={membership}
                  canManage={canManage}
                  isOwner={isOwner}
                  isSelf={membership.userId === user?.id}
                  onChanged={reload}
                />
              ))}
            </ul>
          )}
          {nextCursor ? (
            <div>
              <Button variant="outline" size="sm" onClick={() => void load(nextCursor)}>
                Load more
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
