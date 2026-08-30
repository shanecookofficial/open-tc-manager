"use client";

import { useState } from "react";
import { toast } from "sonner";

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
import { useAsyncData } from "@/hooks/use-async-data";
import {
  ApiClientError,
  createRole,
  deleteRole,
  listRoles,
  updateRole,
} from "@/lib/api-client";
import { PERMISSION_LABELS } from "@/lib/auth/permissions";
import { PERMISSIONS, type Permission, type Role } from "@/lib/contracts";

type RoleDialogState =
  | { kind: "create" }
  | { kind: "edit"; role: Role }
  | null;

function emptyPermissions(): Record<Permission, boolean> {
  return {
    "cases.write": false,
    "cases.revert": false,
    "directories.write": false,
    "cases.bulk": false,
    "trash.purge": false,
    "projects.write": false,
  };
}

function fromRole(role: Role): Record<Permission, boolean> {
  const selected = emptyPermissions();
  for (const permission of role.permissions) {
    selected[permission] = true;
  }
  return selected;
}

function selectedList(flags: Record<Permission, boolean>): Permission[] {
  return PERMISSIONS.filter((permission) => flags[permission]);
}

function kindLabel(role: Role): string {
  if (role.locked) return "System";
  if (role.builtIn) return "Built-in";
  return "Custom";
}

export function RolesAdminView({ onChanged }: { onChanged?: () => void }) {
  const { data, refetch } = useAsyncData(
    () => listRoles().then((response) => response.items),
    [],
  );
  const roles = data ?? [];

  const [dialog, setDialog] = useState<RoleDialogState>(null);
  const [confirmDelete, setConfirmDelete] = useState<Role | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [flags, setFlags] = useState<Record<Permission, boolean>>(emptyPermissions);

  const openCreate = () => {
    setName("");
    setDescription("");
    setFlags(emptyPermissions());
    setDialog({ kind: "create" });
  };

  const openEdit = (role: Role) => {
    setName(role.name);
    setDescription(role.description ?? "");
    setFlags(fromRole(role));
    setDialog({ kind: "edit", role });
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const permissions = selectedList(flags);
      if (dialog?.kind === "create") {
        await createRole({
          name,
          description: description.trim() ? description.trim() : null,
          permissions,
        });
        toast.success("Role created");
      } else if (dialog?.kind === "edit") {
        await updateRole(dialog.role.id, {
          name,
          description: description.trim() ? description.trim() : null,
          permissions,
        });
        toast.success("Role updated");
      }
      setDialog(null);
      refetch();
      onChanged?.();
    } catch (error) {
      if (error instanceof ApiClientError) toast.error(error.message);
      else toast.error("Failed to save role");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setIsSubmitting(true);
    try {
      await deleteRole(confirmDelete.id);
      toast.success(`Deleted role "${confirmDelete.name}"`);
      setConfirmDelete(null);
      refetch();
      onChanged?.();
    } catch (error) {
      if (error instanceof ApiClientError) toast.error(error.message);
      else toast.error("Failed to delete role");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Roles</h2>
          <p className="text-sm text-muted-foreground">
            Admin cannot be deleted. Member and Viewer can be removed when no
            users have them. Custom roles pick from the permission list.
          </p>
        </div>
        <Button onClick={openCreate}>Create role</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell>
                <div className="font-medium">{role.name}</div>
                <div className="text-xs text-muted-foreground">{role.slug}</div>
              </TableCell>
              <TableCell>
                <Badge variant={role.locked ? "secondary" : "outline"}>
                  {kindLabel(role)}
                </Badge>
              </TableCell>
              <TableCell className="max-w-md text-sm text-muted-foreground">
                {role.locked
                  ? "All permissions, including users and roles"
                  : role.permissions.length === 0
                    ? "Read only"
                    : role.permissions
                        .map((permission) => PERMISSION_LABELS[permission])
                        .join(", ")}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={role.locked}
                    onClick={() => openEdit(role)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={role.locked}
                    onClick={() => setConfirmDelete(role)}
                  >
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === "edit" ? "Edit role" : "Create role"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">Name</Label>
              <Input
                id="role-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-description">Description (optional)</Label>
              <Input
                id="role-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Permissions</legend>
              {PERMISSIONS.map((permission) => (
                <label
                  key={permission}
                  className="flex items-start gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={flags[permission]}
                    onChange={(event) =>
                      setFlags((current) => ({
                        ...current,
                        [permission]: event.target.checked,
                      }))
                    }
                  />
                  {PERMISSION_LABELS[permission]}
                </label>
              ))}
            </fieldset>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? "Saving…" : "Save role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete
                ? `Delete "${confirmDelete.name}"? Users with this role must be reassigned first.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isSubmitting ? "Deleting…" : "Delete role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
