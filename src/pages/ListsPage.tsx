import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, FileSpreadsheet, Check, X, ChevronDown, ChevronRight, Sparkles, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import ListDetailDialog from "@/components/ListDetailDialog";

interface DialList {
  id: string;
  name: string;
  file_name: string;
  row_count: number;
  detected_fields: string[];
  status: string;
  created_at: string;
}

interface ParseResult {
  detected_fields: string[];
  phone_column: string;
  name_column: string;
  rows: Record<string, string>[];
  count: number;
  preview: Record<string, string>[];
  suggested_name: string;
  field_map: Record<string, string>;
  quality_notes: string[];
  valid_count: number;
  skip_count: number;
}

type Step = "idle" | "analyzing" | "confirm" | "saving";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return digits;
}

function isValidPhone(raw: string): boolean {
  const digits = raw.replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

const ROLE_COLORS: Record<string, "default" | "secondary" | "outline"> = {
  phone: "default",
  name: "secondary",
};

export default function ListsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [lists, setLists] = useState<DialList[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("idle");
  const [listName, setListName] = useState("");
  const [fileName, setFileName] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);
  const [selectedList, setSelectedList] = useState<DialList | null>(null);
  const [listContactCounts, setListContactCounts] = useState<Record<string, { contacted: number; total: number }>>({});
  const handleDelete = async () => {
    if (!deletingListId) return;
    try {
      const { error } = await supabase.from("dial_lists").delete().eq("id", deletingListId);
      if (error) throw error;
      toast({ title: "List deleted" });
      loadLists();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingListId(null);
    }
  };

  const loadLists = async () => {
    const { data } = await supabase
      .from("dial_lists")
      .select("*")
      .order("created_at", { ascending: false });
    const fetchedLists = (data as any[]) || [];
    setLists(fetchedLists);
    setLoading(false);

    // Fetch contact counts per list for progress bars
    if (fetchedLists.length > 0) {
      const listIds = fetchedLists.map((l) => l.id);
      const { data: contacts } = await supabase
        .from("contacts")
        .select("list_id, status")
        .in("list_id", listIds);

      const counts: Record<string, { contacted: number; total: number }> = {};
      (contacts || []).forEach((c: any) => {
        if (!c.list_id) return;
        if (!counts[c.list_id]) counts[c.list_id] = { contacted: 0, total: 0 };
        counts[c.list_id].total++;
        if (c.status !== "queued") counts[c.list_id].contacted++;
      });
      setListContactCounts(counts);
    }
  };

  useEffect(() => {
    if (user) loadLists();
  }, [user]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['xlsx', 'xls', 'xlsm', 'ods'].includes(ext || '')) {
      toast({ title: "Unsupported format", description: "Please export your spreadsheet as CSV first.", variant: "destructive" });
      return;
    }

    setStep("analyzing");
    setFileName(file.name);

    try {
      const text = await file.text();
      if (text.includes('\x00') || text.startsWith('PK')) {
        toast({ title: "Unsupported format", description: "This appears to be a binary file. Please save it as CSV first.", variant: "destructive" });
        setStep("idle");
        return;
      }
      const { data, error } = await supabase.functions.invoke("parse-dial-list", {
        body: { file_content: text },
      });
      if (error) throw error;

      setParseResult(data);
      setAllRows(data.rows);
      setListName(data.suggested_name || file.name.replace(/\.csv$/i, ""));
      setStep("confirm");
    } catch (err: any) {
      toast({ title: "Parse error", description: err.message, variant: "destructive" });
      setStep("idle");
    }
  };

  const handleSave = async () => {
    if (!parseResult || !parseResult.phone_column) return;
    setStep("saving");

    const phoneCol = parseResult.phone_column;

    // Filter & normalize
    const cleanedRows = allRows
      .filter((row) => {
        const phone = row[phoneCol] || "";
        return isValidPhone(phone);
      })
      .map((row) => {
        const sanitized: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          sanitized[k] = (v || "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
        }
        sanitized[phoneCol] = normalizePhone(sanitized[phoneCol] || "");
        return sanitized;
      });

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user!.id)
        .single();
      if (!profile?.org_id) throw new Error("No organization found");

      const { data: list, error: listErr } = await supabase
        .from("dial_lists")
        .insert({
          org_id: profile.org_id,
          name: listName,
          file_name: fileName,
          row_count: cleanedRows.length,
          detected_fields: parseResult.field_map && Object.keys(parseResult.field_map).length > 0 ? parseResult.field_map : parseResult.detected_fields,
        } as any)
        .select()
        .single();
      if (listErr) throw listErr;

      const batchSize = 500;
      for (let i = 0; i < cleanedRows.length; i += batchSize) {
        const batch = cleanedRows.slice(i, i + batchSize).map((row) => ({
          list_id: (list as any).id,
          row_data: row,
        }));
        const { error: rowErr } = await supabase.from("dial_list_rows" as any).insert(batch);
        if (rowErr) throw rowErr;
      }

      toast({ title: "List imported", description: `${cleanedRows.length} contacts imported successfully.` });
      resetUpload();
      loadLists();
    } catch (err: any) {
      toast({ title: "Save error", description: err.message, variant: "destructive" });
      setStep("confirm");
    }
  };

  const resetUpload = () => {
    setStep("idle");
    setParseResult(null);
    setAllRows([]);
    setListName("");
    setFileName("");
    setPreviewOpen(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lists</h1>
          <p className="text-muted-foreground mt-1">Upload and manage contact lists for campaigns.</p>
        </div>
      </div>

      {/* Upload area */}
      {step === "idle" && (
        <Card>
          <CardContent className="p-6">
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border px-8 py-12 text-center hover:border-primary transition-colors">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">Drop a CSV file or click to upload</p>
                <p className="text-sm text-muted-foreground">AI will automatically detect columns and organize your data.</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".csv"
                onChange={handleFileSelect}
              />
            </label>
          </CardContent>
        </Card>
      )}

      {/* AI Analyzing */}
      {step === "analyzing" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 p-12">
            <div className="relative">
              <Sparkles className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <div className="text-center space-y-2">
              <p className="font-medium text-foreground">AI is analyzing your file...</p>
              <p className="text-sm text-muted-foreground">Detecting columns, mapping fields, and checking data quality</p>
            </div>
            <div className="w-64 space-y-2">
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-3/4" />
              <Skeleton className="h-2 w-1/2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Confirm Card */}
      {step === "confirm" && parseResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Ready to Import
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* List Name */}
            <div className="space-y-2">
              <Label>List Name</Label>
              <Input value={listName} onChange={(e) => setListName(e.target.value)} />
            </div>

            {/* Field Map Badges */}
            {parseResult.field_map && Object.keys(parseResult.field_map).length > 0 && (
              <div>
                <Label className="mb-2 block">Detected Fields</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(parseResult.field_map).map(([header, role]) => (
                    <Badge
                      key={header}
                      variant={ROLE_COLORS[role] || "outline"}
                    >
                      {role}: {header}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Quality Summary */}
            <div className="flex items-center gap-4 text-sm">
              <span className="font-medium text-foreground">
                {parseResult.valid_count} valid contacts
              </span>
              {parseResult.skip_count > 0 && (
                <span className="text-muted-foreground">
                  • {parseResult.skip_count} skipped (no phone)
                </span>
              )}
            </div>

            {/* Quality Notes */}
            {parseResult.quality_notes && parseResult.quality_notes.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
                {parseResult.quality_notes.map((note, i) => (
                  <p key={i} className="text-xs text-muted-foreground">• {note}</p>
                ))}
              </div>
            )}

            {/* Collapsible Preview */}
            <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                  {previewOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Preview data
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ScrollArea className="max-h-[240px] rounded-lg border mt-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {parseResult.detected_fields.map((f) => (
                          <TableHead key={f} className="whitespace-nowrap">{f}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parseResult.preview.map((row, i) => (
                        <TableRow key={i}>
                          {parseResult.detected_fields.map((f) => (
                            <TableCell key={f} className="whitespace-nowrap">{row[f]}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CollapsibleContent>
            </Collapsible>

            {/* Actions */}
            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={!parseResult.phone_column || !listName.trim()}>
                <Check className="mr-2 h-4 w-4" />
                Import {parseResult.valid_count} Contacts
              </Button>
              <Button variant="outline" onClick={resetUpload}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "saving" && (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 p-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-muted-foreground">Importing contacts...</span>
          </CardContent>
        </Card>
      )}

      {/* Existing lists */}
      {lists.length === 0 && step === "idle" ? (
        <div className="surface-elevated rounded-xl p-12 text-center space-y-4">
          <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">No lists uploaded yet. Upload a CSV to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lists.map((l) => {
            const counts = listContactCounts[l.id];
            const penetration = counts && counts.total > 0
              ? (counts.contacted / counts.total) * 100
              : 0;

            return (
              <Card
                key={l.id}
                className="cursor-pointer hover-lift rounded-xl transition-all"
                onClick={() => setSelectedList(l)}
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1 flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{l.name}</h3>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{l.file_name}</span>
                        <span>•</span>
                        <span>{l.row_count} contacts</span>
                        <span>•</span>
                        <span>{new Date(l.created_at).toLocaleDateString()}</span>
                      </div>
                      {l.detected_fields && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(Array.isArray(l.detected_fields) ? l.detected_fields : Object.entries(l.detected_fields as Record<string, string>)).map((f, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">
                              {Array.isArray(l.detected_fields) ? f : `${(f as [string, string])[1]}: ${(f as [string, string])[0]}`}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={l.status === "ready" ? "default" : "secondary"}>{l.status}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingListId(l.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {counts && counts.total > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {counts.contacted}/{counts.total} contacted
                        </span>
                        <span className="font-medium text-primary">
                          {penetration.toFixed(0)}% penetration
                        </span>
                      </div>
                      <Progress value={penetration} className="h-1.5" />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deletingListId} onOpenChange={(open) => !open && setDeletingListId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete List</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this list and all its contact rows. Campaigns using this list will no longer reference it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ListDetailDialog
        list={selectedList}
        open={!!selectedList}
        onOpenChange={(open) => !open && setSelectedList(null)}
      />
    </div>
  );
}
