"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/auth-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RolesAdminView } from "@/components/users/roles-admin-view";
import { useAsyncData } from "@/hooks/use-async-data";
import {
  ApiClientError,
  createUser,
  listRoles,
  listUsers,
  updateUser,
} from "@/lib/api-client";
import { roleLabel } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format-date";
import type { User } from "@/lib/contracts";

type UserDialogState =
  | { kind: "create" }
  | { kind: "password"; user: User }
  | { kind: "role"; user: User }
  | null;

export function UsersAdminView() {
  const { user: currentUser } = useAuth();
  const { data, refetch } = useAsyncData(
    () => listUsers().then((response) => response.items),
    [],
  );
  const users = data ?? [];
  const { data: roleData, refetch: refetchRoles } = useAsyncData(
    () => listRoles().then((response) => response.items),
    [],
  );
  const assignableRoles = roleData ?? [];
  const defaultRoleSlug =
    assignableRoles.find((role) => role.slug === "member")?.slug ??
    assignableRoles.find((role) => !role.locked)?.slug ??
    "admin";
  const activeAdminCount = users.filter(
    (user) => user.role === "admin" && user.deactivatedAt === null,
  ).length;
  const isLastRemainingAdmin = (user: User) =>
    user.role === "admin" &&
    user.deactivatedAt === null &&
    activeAdminCount <= 1;

  const [dialog, setDialog] = useState<UserDialogState>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [createEmail, setCreateEmail] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createRole, setCreateRole] = useState("member");
  const [createPassword, setCreatePassword] = useState("");

  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("member");

  const openCreate = () => {
    setCreateEmail("");
    setCreateDisplayName("");
    setCreateRole(defaultRoleSlug);
    setCreatePassword("");
    setDialog({ kind: "create" });
  };

  const handleCreate = async () => {
    setIsSubmitting(true);
    try {
      await createUser({
        email: createEmail,
        displayName: createDisplayName,
        role: createRole,
        password: createPassword,
      });
      toast.success("User created");
      setDialog(null);
      refetch();
    } catch (error) {
      if (error instanceof ApiClientError) toast.error(error.message);
      else toast.error("Failed to create user");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetPassword = async () => {
    if (dialog?.kind !== "password") return;
    setIsSubmitting(true);
    try {
      await updateUser(dialog.user.id, { password: editPassword });
      toast.success("Password updated");
      setDialog(null);
    } catch (error) {
      if (error instanceof ApiClientError) toast.error(error.message);
      else toast.error("Failed to set password");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeRole = async () => {
    if (dialog?.kind !== "role") return;
    if (isLastRemainingAdmin(dialog.user) && editRole !== "admin") {
      toast.error("Cannot deactivate or demote the last remaining Admin.");
      return;
    }
    setIsSubmitting(true);
    try {
      await updateUser(dialog.user.id, { role: editRole });
      toast.success("Role updated");
      setDialog(null);
      refetch();
    } catch (error) {
      if (error instanceof ApiClientError) toast.error(error.message);
      else toast.error("Failed to change role");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirmDeactivate) return;
    setIsSubmitting(true);
    try {
      await updateUser(confirmDeactivate.id, {
        deactivatedAt: new Date().toISOString(),
      });
      toast.success("User deactivated");
      setConfirmDeactivate(null);
      refetch();
    } catch (error) {
      if (error instanceof ApiClientError) toast.error(error.message);
      else toast.error("Failed to deactivate user");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReactivate = async (user: User) => {
    setIsSubmitting(true);
    try {
      await updateUser(user.id, { deactivatedAt: null });
      toast.success("User reactivated");
      refetch();
    } catch (error) {
      if (error instanceof ApiClientError) toast.error(error.message);
      else toast.error("Failed to reactivate user");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Test cases
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Create accounts and manage roles for this OpenTCM instance.
          </p>
        </div>
        <Button onClick={openCreate}>Create user</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Display name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-56 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-mono text-sm">{user.email}</TableCell>
              <TableCell>{user.displayName}</TableCell>
              <TableCell>
                <Badge variant="outline">
                  {roleLabel(user.role, user.roleName)}
                </Badge>
              </TableCell>
              <TableCell>
                {user.deactivatedAt ? (
                  <span className="text-sm text-muted-foreground">
                    Deactivated {formatDateTime(user.deactivatedAt)}
                  </span>
                ) : (
                  <span className="text-sm text-green-700">Active</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditPassword("");
                      setDialog({ kind: "password", user });
                    }}
                  >
                    Set password
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditRole(user.role);
                      setDialog({ kind: "role", user });
                    }}
                  >
                    Change role
                  </Button>
                  {user.deactivatedAt ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReactivate(user)}
                      disabled={isSubmitting}
                    >
                      Reactivate
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmDeactivate(user)}
                      disabled={
                        user.id === currentUser?.id ||
                        isLastRemainingAdmin(user)
                      }
                      title={
                        isLastRemainingAdmin(user)
                          ? "Cannot deactivate the last remaining Admin."
                          : user.id === currentUser?.id
                            ? "You cannot deactivate your own account."
                            : undefined
                      }
                    >
                      Deactivate
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={dialog?.kind === "create"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                value={createEmail}
                onChange={(event) => setCreateEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-display-name">Display name</Label>
              <Input
                id="create-display-name"
                value={createDisplayName}
                onChange={(event) => setCreateDisplayName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-role">Role</Label>
              <select
                id="create-role"
                className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={createRole}
                onChange={(event) => setCreateRole(event.target.value)}
              >
                {assignableRoles.map((role) => (
                  <option key={role.slug} value={role.slug}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">Password</Label>
              <Input
                id="create-password"
                type="password"
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog?.kind === "password"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set password</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-password">New password</Label>
            <Input
              id="edit-password"
              type="password"
              value={editPassword}
              onChange={(event) => setEditPassword(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleSetPassword} disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Set password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog?.kind === "role"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-role">Role</Label>
            <select
              id="edit-role"
              className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={editRole}
              onChange={(event) => setEditRole(event.target.value)}
            >
              {assignableRoles.map((role) => (
                <option key={role.slug} value={role.slug}>
                  {role.name}
                </option>
              ))}
            </select>
            {dialog?.kind === "role" &&
            isLastRemainingAdmin(dialog.user) &&
            editRole !== "admin" ? (
              <p role="alert" className="text-sm text-destructive">
                Cannot deactivate or demote the last remaining Admin.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleChangeRole}
              disabled={
                isSubmitting ||
                (dialog?.kind === "role" &&
                  isLastRemainingAdmin(dialog.user) &&
                  editRole !== "admin")
              }
            >
              {isSubmitting ? "Saving…" : "Save role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDeactivate !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeactivate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate user?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeactivate?.email} will not be able to sign in until
              reactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              disabled={isSubmitting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isSubmitting ? "Deactivating…" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RolesAdminView onChanged={refetchRoles} />
    </div>
  );
}
