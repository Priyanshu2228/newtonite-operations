"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTeamUpdates, createTeamUpdate } from "@/lib/api-client";
import { usePersona, ALL_PERSONAS } from "@/lib/persona-context";
import { formatRelative } from "@/lib/display-helpers";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, AlertCircle, Loader2 } from "lucide-react";

export function TeamUpdates({ teamId }: { teamId: string }) {
  const { personaId } = usePersona();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activePersona = ALL_PERSONAS.find((p) => p.id === personaId);
  // Viewers cannot post
  const isViewer = activePersona?.teamRole === "Viewer";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["team-updates", personaId, teamId],
    queryFn: () => fetchTeamUpdates(teamId),
  });

  const mutation = useMutation({
    mutationFn: (text: string) => createTeamUpdate(teamId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-updates", personaId, teamId] });
      setContent("");
      setError(null);
    },
    onError: (err: any) => {
      setError(err.message ?? "Failed to post update");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 pt-4 border-t border-border">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="pt-4 border-t border-border flex items-center gap-2 text-red-600">
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">Failed to load team updates</span>
      </div>
    );
  }

  const updates = data?.updates ?? [];

  return (
    <div className="pt-4 border-t border-border flex flex-col gap-4">
      {/* Feed */}
      <div className="space-y-0 border border-border rounded-md divide-y divide-border/60 overflow-hidden bg-card">
        {updates.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground italic">
            No updates yet. {isViewer ? "" : "Post the first operational update for this team."}
          </div>
        ) : (
          updates.map((update) => (
            <div key={update.id} className="p-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="font-semibold text-sm text-foreground">
                  {update.author?.name ?? "Unknown"}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatRelative(update.createdAt)}
                </span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{update.content}</p>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      {!isViewer ? (
        <div className="space-y-2">
          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write an operational update..."
            className="text-sm min-h-[60px]"
            rows={2}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => mutation.mutate(content)}
              disabled={!content.trim() || mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1" />
              )}
              Post Update
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-3 bg-muted/40 rounded-md border border-border/50 text-center text-xs text-muted-foreground">
          View-only mode: You cannot post updates to this team.
        </div>
      )}
    </div>
  );
}
