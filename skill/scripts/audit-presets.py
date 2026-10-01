#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
music-code-mv · preset palette audit —— 把 styles.md 的配色纪律变成可跑的测试。
The colour discipline in reference/styles.md, as a test. Exit 1 on any violation.

  python scripts/audit-presets.py            # audit presets/*.json
  python scripts/audit-presets.py --json     # machine-readable summary

Rules enforced (styles.md 六角色 + 品牌两色系统):
  R1  text vs bg contrast >= 4.5:1  (body text rule 5)
  R2  accent vs base: brighter, more saturated, hue jumps >=30 deg, or far in RGB,
      or an official identity-gradient order (gemini/mistral, documented exemption)
  R3  hot vs base: luminance ratio > 1.15 or RGB distance > 90  (must read as distinct)
  R4  every role present, hex well-formed
"""
from __future__ import annotations

import argparse
import colorsys
import json
import math
import sys
from pathlib import Path

PRESETS = Path(__file__).resolve().parent.parent / "presets"
ROLES = ("bg", "dim", "base", "accent", "hot", "text")
GRADIENT_ORDER = {"gemini", "mistral"}  # 官方身份色序 / official identity gradients


def rgb(h: str):
    h = h.lstrip("#")
    if len(h) != 6:
        raise ValueError("not a 6-digit hex: " + h)
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def lum(h: str) -> float:
    def f(c):
        c /= 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (f(c) for c in rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def hsv(h: str):
    r, g, b = (c / 255 for c in rgb(h))
    hh, s, v = colorsys.rgb_to_hsv(r, g, b)
    return hh * 360, s, v


def hue_gap(a: str, b: str) -> float:
    d = abs(hsv(a)[0] - hsv(b)[0])
    return min(d, 360 - d)


def audit_one(pid: str, pal: dict) -> list[str]:
    issues = []
    for role in ROLES:
        if role not in pal:
            issues.append("R4 missing role: " + role)
        else:
            try:
                rgb(pal[role])
            except Exception as e:
                issues.append("R4 %s: %s" % (role, e))
    if issues:
        return issues

    cr = contrast(pal["text"], pal["bg"])
    if cr < 4.5:
        issues.append("R1 text/bg %.2f:1 < 4.5:1" % cr)

    # R2 accent vs base
    if pid not in GRADIENT_ORDER:
        lb, sa = lum(pal["base"]), lum(pal["accent"])
        sat_b, sat_a = hsv(pal["base"])[1], hsv(pal["accent"])[1]
        dist = math.dist(rgb(pal["base"]), rgb(pal["accent"]))
        gap = hue_gap(pal["base"], pal["accent"])
        if not (sa > lb + 0.02 or sat_a > sat_b + 0.05 or gap >= 30 or dist > 90):
            issues.append("R2 accent not distinguishable from base "
                          "(dLum=%.3f dSat=%.2f hue=%d dist=%d)" % (sa - lb, sat_a - sat_b, gap, dist))

    # R3 hot vs base
    if not (contrast(pal["hot"], pal["base"]) > 1.15
            or math.dist(rgb(pal["hot"]), rgb(pal["base"])) > 90):
        issues.append("R3 hot not distinct from base (ratio=%.2f dist=%d)" % (
            contrast(pal["hot"], pal["base"]), math.dist(rgb(pal["hot"]), rgb(pal["base"]))))
    return issues


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    report, failures = {}, 0
    for p in sorted(PRESETS.glob("*.json")):
        data = json.loads(p.read_text("utf-8"))
        pid = data.get("id", p.stem)
        issues = audit_one(pid, data.get("palette", {}))
        three = data.get("three") or {}
        if not three.get("roles"):
            issues.append("R4 missing three.roles block")
        report[pid] = issues
        failures += len(issues)
        if not args.json:
            print("%-12s %s" % (pid, "PASS" if not issues else "FAIL"))
            for i in issues:
                print("             - " + i)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        n = len(report)
        print("---")
        print("%d presets, %d issues" % (n, failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
