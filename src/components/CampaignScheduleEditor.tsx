import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Calendar, X } from "lucide-react";
import { useState } from "react";

const DAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Phoenix", label: "Arizona (AZ)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
];

interface ScheduleData {
  schedule_enabled: boolean;
  schedule_days: string[];
  schedule_start_time: string;
  schedule_end_time: string;
  schedule_timezone: string;
  schedule_day_overrides: Record<string, { start: string; end: string }>;
}

interface Props {
  value: ScheduleData;
  onChange: (value: ScheduleData) => void;
}

export default function CampaignScheduleEditor({ value, onChange }: Props) {
  const [overrideDay, setOverrideDay] = useState("");

  const update = (partial: Partial<ScheduleData>) => {
    onChange({ ...value, ...partial });
  };

  const toggleDay = (day: string) => {
    const days = value.schedule_days.includes(day)
      ? value.schedule_days.filter((d) => d !== day)
      : [...value.schedule_days, day];
    update({ schedule_days: days });
  };

  const addOverride = () => {
    if (!overrideDay || value.schedule_day_overrides[overrideDay]) return;
    update({
      schedule_day_overrides: {
        ...value.schedule_day_overrides,
        [overrideDay]: { start: value.schedule_start_time, end: value.schedule_end_time },
      },
    });
    setOverrideDay("");
  };

  const removeOverride = (day: string) => {
    const { [day]: _, ...rest } = value.schedule_day_overrides;
    update({ schedule_day_overrides: rest });
  };

  const updateOverride = (day: string, field: "start" | "end", val: string) => {
    update({
      schedule_day_overrides: {
        ...value.schedule_day_overrides,
        [day]: { ...value.schedule_day_overrides[day], [field]: val },
      },
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-border/50 p-4 bg-card/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Label className="font-semibold">Dialing Schedule</Label>
        </div>
        <Switch
          checked={value.schedule_enabled}
          onCheckedChange={(v) => update({ schedule_enabled: v })}
        />
      </div>

      {value.schedule_enabled && (
        <div className="space-y-4 pt-2">
          {/* Days of week */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Dialing Days</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    value.schedule_days.includes(d.value)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-muted-foreground border-border hover:bg-accent"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Default hours */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Start Time
              </Label>
              <Input
                type="time"
                value={value.schedule_start_time}
                onChange={(e) => update({ schedule_start_time: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> End Time
              </Label>
              <Input
                type="time"
                value={value.schedule_end_time}
                onChange={(e) => update({ schedule_end_time: e.target.value })}
              />
            </div>
          </div>

          {/* Timezone */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Timezone</Label>
            <Select value={value.schedule_timezone} onValueChange={(v) => update({ schedule_timezone: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Day overrides */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Custom Hours (per day)</Label>
            {Object.entries(value.schedule_day_overrides).map(([day, times]) => (
              <div key={day} className="flex items-center gap-2">
                <Badge variant="outline" className="min-w-[3rem] justify-center capitalize">{day}</Badge>
                <Input
                  type="time"
                  value={times.start}
                  onChange={(e) => updateOverride(day, "start", e.target.value)}
                  className="w-28"
                />
                <span className="text-muted-foreground text-xs">to</span>
                <Input
                  type="time"
                  value={times.end}
                  onChange={(e) => updateOverride(day, "end", e.target.value)}
                  className="w-28"
                />
                <Button size="sm" variant="ghost" onClick={() => removeOverride(day)} className="h-7 w-7 p-0">
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Select value={overrideDay} onValueChange={setOverrideDay}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Day..." />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.filter((d) => !value.schedule_day_overrides[d.value]).map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={addOverride} disabled={!overrideDay}>
                Add Override
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const defaultSchedule: ScheduleData = {
  schedule_enabled: false,
  schedule_days: ["mon", "tue", "wed", "thu", "fri"],
  schedule_start_time: "09:00",
  schedule_end_time: "17:00",
  schedule_timezone: "America/New_York",
  schedule_day_overrides: {},
};
