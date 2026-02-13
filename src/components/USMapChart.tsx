import { useMemo, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface USMapChartProps {
  stateData: Record<string, number>;
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

// Simplified US state paths (centered around 0-960, 0-600 viewBox)
const STATE_PATHS: Record<string, { d: string; cx: number; cy: number }> = {
  WA: { d: "M108,18 L170,18 175,22 178,45 182,58 130,58 108,55 100,30Z", cx: 140, cy: 38 },
  OR: { d: "M100,30 L108,55 130,58 138,100 80,100 62,68 70,42Z", cx: 105, cy: 70 },
  CA: { d: "M62,68 L80,100 82,140 90,180 100,210 78,230 50,200 40,160 42,120 52,85Z", cx: 72, cy: 155 },
  NV: { d: "M80,100 L130,100 122,175 90,180 82,140Z", cx: 105, cy: 140 },
  ID: { d: "M130,58 L175,22 188,22 195,60 182,100 148,100 138,100Z", cx: 162, cy: 65 },
  UT: { d: "M130,100 L148,100 182,100 182,175 130,175 122,175Z", cx: 155, cy: 138 },
  AZ: { d: "M90,180 L122,175 130,175 130,255 100,270 75,250 78,230Z", cx: 108, cy: 220 },
  MT: { d: "M188,22 L295,18 298,70 195,75 195,60Z", cx: 245, cy: 45 },
  WY: { d: "M195,75 L298,70 300,130 200,135Z", cx: 248, cy: 102 },
  CO: { d: "M200,135 L300,130 305,200 205,205Z", cx: 252, cy: 168 },
  NM: { d: "M205,205 L305,200 310,280 215,285 210,260Z", cx: 258, cy: 242 },
  ND: { d: "M298,18 L395,18 398,68 298,70Z", cx: 348, cy: 42 },
  SD: { d: "M298,70 L398,68 400,128 300,130Z", cx: 348, cy: 98 },
  NE: { d: "M300,130 L400,128 410,190 305,195Z", cx: 355, cy: 160 },
  KS: { d: "M305,195 L410,190 415,250 310,255Z", cx: 360, cy: 222 },
  OK: { d: "M310,255 L415,250 420,290 375,310 340,290 310,280Z", cx: 375, cy: 272 },
  TX: { d: "M310,280 L340,290 375,310 420,290 430,320 420,380 380,420 340,400 290,380 280,330 295,300Z", cx: 360, cy: 345 },
  MN: { d: "M398,18 L478,20 480,100 400,100Z", cx: 438, cy: 58 },
  IA: { d: "M400,100 L480,100 488,160 410,165Z", cx: 445, cy: 132 },
  MO: { d: "M410,165 L488,160 500,195 510,248 440,250 415,250Z", cx: 462, cy: 205 },
  AR: { d: "M440,250 L510,248 515,305 450,308Z", cx: 478, cy: 278 },
  LA: { d: "M450,308 L515,305 525,340 510,370 480,360 460,345Z", cx: 488, cy: 335 },
  WI: { d: "M478,20 L540,25 558,42 548,110 488,108 480,100Z", cx: 518, cy: 65 },
  IL: { d: "M488,108 L548,110 555,150 550,210 500,218 500,195 488,160Z", cx: 522, cy: 160 },
  MI: { d: "M540,25 L580,20 605,48 590,110 560,120 548,110 558,42Z", cx: 572, cy: 68 },
  IN: { d: "M555,150 L590,148 595,218 555,220 550,210Z", cx: 575, cy: 185 },
  OH: { d: "M590,110 L640,105 650,120 648,178 595,180 590,148Z", cx: 620, cy: 142 },
  KY: { d: "M550,210 L555,220 595,218 648,195 665,210 640,235 570,240Z", cx: 610, cy: 222 },
  TN: { d: "M570,240 L640,235 700,240 695,265 560,268Z", cx: 630, cy: 252 },
  MS: { d: "M515,305 L560,300 565,365 530,370 525,340Z", cx: 542, cy: 335 },
  AL: { d: "M560,268 L600,265 608,340 568,345 565,365 560,300Z", cx: 582, cy: 308 },
  GA: { d: "M600,265 L660,260 670,330 620,345 608,340Z", cx: 638, cy: 300 },
  FL: { d: "M608,340 L620,345 670,330 690,345 700,380 680,420 650,430 635,400 620,365Z", cx: 662, cy: 380 },
  SC: { d: "M660,260 L700,240 720,265 690,285 670,280Z", cx: 690, cy: 265 },
  NC: { d: "M640,235 L700,240 750,228 748,250 720,265 700,240 660,260Z", cx: 708, cy: 245 },
  VA: { d: "M640,235 L665,210 700,195 740,200 750,228 700,240Z", cx: 705, cy: 218 },
  WV: { d: "M648,178 L665,175 680,195 665,210 640,235 570,240 550,210 555,220 595,218 648,195Z", cx: 642, cy: 205 },
  PA: { d: "M640,105 L730,98 738,138 660,148 650,120Z", cx: 692, cy: 122 },
  NY: { d: "M640,45 L730,35 750,58 740,90 730,98 640,105Z", cx: 692, cy: 70 },
  VT: { d: "M730,20 L745,18 748,50 735,55 730,35Z", cx: 738, cy: 38 },
  NH: { d: "M745,18 L758,15 755,50 748,55 748,50Z", cx: 752, cy: 35 },
  ME: { d: "M758,15 L780,5 790,25 775,60 760,55 755,50Z", cx: 772, cy: 32 },
  MA: { d: "M735,55 L748,55 755,50 770,62 760,68 738,68Z", cx: 752, cy: 60 },
  RI: { d: "M760,68 L770,62 775,72 768,75Z", cx: 768, cy: 70 },
  CT: { d: "M738,68 L760,68 758,82 738,82Z", cx: 748, cy: 75 },
  NJ: { d: "M738,98 L738,82 750,82 752,108 740,118Z", cx: 745, cy: 100 },
  DE: { d: "M738,138 L748,130 752,148 742,150Z", cx: 745, cy: 140 },
  MD: { d: "M700,148 L738,138 742,150 752,148 740,168 700,165Z", cx: 722, cy: 155 },
  DC: { d: "M722,162 L726,158 730,162 726,166Z", cx: 726, cy: 162 },
  AK: { d: "M30,370 L120,370 140,390 120,420 80,430 30,410Z", cx: 85, cy: 400 },
  HI: { d: "M180,380 L220,375 230,395 200,405 185,400Z", cx: 205, cy: 390 },
};

function getColorForCount(count: number, maxCount: number): string {
  if (count === 0) return "hsl(220 14% 16%)";
  const intensity = Math.min(count / Math.max(maxCount, 1), 1);
  const lightness = 20 + (1 - intensity) * 25;
  return `hsl(172 66% ${lightness}%)`;
}

function getDotRadius(count: number, maxCount: number): number {
  if (count === 0) return 0;
  const ratio = count / Math.max(maxCount, 1);
  return 3 + ratio * 10;
}

export default function USMapChart({ stateData }: USMapChartProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  const maxCount = useMemo(
    () => Math.max(...Object.values(stateData), 0),
    [stateData]
  );

  const totalCalls = useMemo(
    () => Object.values(stateData).reduce((a, b) => a + b, 0),
    [stateData]
  );

  return (
    <TooltipProvider delayDuration={0}>
      <div className="surface-elevated rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Call Distribution by Region
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalCalls} calls across {Object.keys(stateData).length} states
            </p>
          </div>
        </div>
        <svg
          viewBox="0 0 820 450"
          className="w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
        >
          {Object.entries(STATE_PATHS).map(([abbr, { d, cx, cy }]) => {
            const count = stateData[abbr] || 0;
            const fill = getColorForCount(count, maxCount);
            const isHovered = hoveredState === abbr;

            return (
              <Tooltip key={abbr}>
                <TooltipTrigger asChild>
                  <g
                    onMouseEnter={() => setHoveredState(abbr)}
                    onMouseLeave={() => setHoveredState(null)}
                    className="cursor-pointer"
                  >
                    <path
                      d={d}
                      fill={fill}
                      stroke="hsl(220 14% 20%)"
                      strokeWidth={isHovered ? 1.5 : 0.5}
                      opacity={isHovered ? 1 : 0.85}
                      className="transition-all duration-150"
                    />
                    {count > 0 && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={getDotRadius(count, maxCount)}
                        fill="hsl(172 66% 50%)"
                        opacity={0.7}
                        className="transition-all duration-150"
                      />
                    )}
                  </g>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <p className="font-medium">{STATE_NAMES[abbr] || abbr}</p>
                  <p className="text-muted-foreground">
                    {count} {count === 1 ? "call" : "calls"}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </svg>
      </div>
    </TooltipProvider>
  );
}
