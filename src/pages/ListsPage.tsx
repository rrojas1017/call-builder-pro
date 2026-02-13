import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, FileSpreadsheet, Check, X, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
}

type Step = "idle" | "parsing" | "preview" | "saving";

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
  const [phoneCol, setPhoneCol] = useState("");
  const [nameCol, setNameCol] = useState("");
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);

  const loadLists = async () => {
    const { data } = await supabase
      .from("dial_lists")
      .select("*")
      .order("created_at", { ascending: false });
    setLists((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) loadLists();
  }, [user]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep("parsing");
    setFileName(file.name);
    setListName(file.name.replace(/\.csv$/i, ""));

    try {
      const text = await file.text();
      const { data, error } = await supabase.functions.invoke("parse-dial-list", {
        body: { file_content: text },
      });
      if (error) throw error;

      setParseResult(data);
      setAllRows(data.rows);
      setPhoneCol(data.phone_column || "");
      setNameCol(data.name_column || "");
      setStep("preview");
    } catch (err: any) {
      toast({ title: "Parse error", description: err.message, variant: "destructive" });
      setStep("idle");
    }
  };

  const handleSave = async () => {
    if (!parseResult || !phoneCol) return;
    setStep("saving");

    try {
      // Get org_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user!.id)
        .single();
      if (!profile?.org_id) throw new Error("No organization found");

      // Insert dial_list
      const { data: list, error: listErr } = await supabase
        .from("dial_lists")
        .insert({
          org_id: profile.org_id,
          name: listName,
          file_name: fileName,
          row_count: allRows.length,
          detected_fields: parseResult.detected_fields,
        } as any)
        .select()
        .single();
      if (listErr) throw listErr;

      // Insert rows in batches
      const batchSize = 500;
      for (let i = 0; i < allRows.length; i += batchSize) {
        const batch = allRows.slice(i, i + batchSize).map((row) => ({
          list_id: (list as any).id,
          row_data: row,
        }));
        const { error: rowErr } = await supabase.from("dial_list_rows" as any).insert(batch);
        if (rowErr) throw rowErr;
      }

      toast({ title: "List saved", description: `${allRows.length} contacts imported.` });
      resetUpload();
      loadLists();
    } catch (err: any) {
      toast({ title: "Save error", description: err.message, variant: "destructive" });
      setStep("preview");
    }
  };

  const resetUpload = () => {
    setStep("idle");
    setParseResult(null);
    setAllRows([]);
    setPhoneCol("");
    setNameCol("");
    setListName("");
    setFileName("");
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
                <p className="text-sm text-muted-foreground">We'll auto-detect columns like name, phone, state, etc.</p>
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

      {step === "parsing" && (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 p-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-muted-foreground">Analyzing {fileName}...</span>
          </CardContent>
        </Card>
      )}

      {/* Preview & confirm */}
      {step === "preview" && parseResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Preview — {parseResult.count} rows detected
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>List Name</Label>
                <Input value={listName} onChange={(e) => setListName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Phone Column <span className="text-destructive">*</span></Label>
                <Select value={phoneCol} onValueChange={setPhoneCol}>
                  <SelectTrigger><SelectValue placeholder="Select phone column" /></SelectTrigger>
                  <SelectContent>
                    {parseResult.detected_fields.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Name Column</Label>
                <Select value={nameCol} onValueChange={setNameCol}>
                  <SelectTrigger><SelectValue placeholder="Select name column" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none_">(none)</SelectItem>
                    {parseResult.detected_fields.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Detected Fields</Label>
              <div className="flex flex-wrap gap-2">
                {parseResult.detected_fields.map((f) => (
                  <Badge
                    key={f}
                    variant={f === phoneCol ? "default" : f === nameCol ? "secondary" : "outline"}
                  >
                    {f}
                    {f === phoneCol && " (phone)"}
                    {f === nameCol && " (name)"}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Sample Data (first 5 rows)</Label>
              <ScrollArea className="max-h-[240px] rounded-lg border">
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
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={!phoneCol || !listName.trim()}>
                <Check className="mr-2 h-4 w-4" />
                Confirm & Save ({parseResult.count} contacts)
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
            <span className="text-muted-foreground">Saving list...</span>
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
          {lists.map((l) => (
            <Card key={l.id}>
              <CardContent className="flex items-center justify-between p-5">
                <div className="space-y-1">
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
                      {(l.detected_fields as string[]).map((f) => (
                        <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Badge variant={l.status === "ready" ? "default" : "secondary"}>{l.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
