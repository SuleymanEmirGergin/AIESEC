"""Search policy engine for determining radius and query modes."""

from dataclasses import dataclass
from typing import Literal, Optional
from app.models import RADIUS_PRESETS


@dataclass
class SearchPolicyInput:
    """Input parameters for policy decision."""
    type: str
    lat: float
    lon: float
    radius: Optional[int]
    mode: str = "auto"


@dataclass
class SearchPolicyDecision:
    """Decision output from the policy engine."""
    effective_radius: int
    requested_mode: str
    effective_mode: Literal["around", "bbox"]
    fallback_mode: Optional[Literal["around", "bbox"]]
    reason: str


def decide_policy(params: SearchPolicyInput) -> SearchPolicyDecision:
    """
    Apply business rules to determine search strategy.
    
    Rules:
    1. Default radius by type if missing/invalid.
    2. Max radius 5000m.
    3. Auto-mode selection:
       - Education types <= 3km -> around
       - B2B types or radius > 3km -> bbox
    4. Fallback is always the 'other' mode (max 2 attempts).
    """
    # 1. Determine Effective Radius
    eff_radius = params.radius
    if eff_radius is None or eff_radius <= 0:
        eff_radius = RADIUS_PRESETS.get(params.type, 1500)
    
    # Enforce global bounds
    eff_radius = min(5000, max(100, eff_radius))

    # 2. Determine Effective Mode
    req_mode = params.mode or "auto"
    eff_mode: Literal["around", "bbox"] = "around"
    reason = "explicit"

    if req_mode == "around":
        eff_mode = "around"
    elif req_mode == "bbox":
        eff_mode = "bbox"
    else:
        # Default to 'auto' logic
        req_mode = "auto"
        is_edu = params.type in [
            "kindergarten", "primary_school", "middle_school",
            "high_school", "private_school", "college_keyword"
        ]
        
        if eff_radius > 3000:
            eff_mode = "bbox"
            reason = "radius"
        elif is_edu:
            eff_mode = "around"
            reason = "education"
        else:
            eff_mode = "bbox"
            reason = "b2b"

    # 3. Determine Fallback
    # Fallback to the other mode to maximize reliability
    fallback_mode: Literal["around", "bbox"] = "bbox" if eff_mode == "around" else "around"

    return SearchPolicyDecision(
        effective_radius=eff_radius,
        requested_mode=req_mode,
        effective_mode=eff_mode,
        fallback_mode=fallback_mode,
        reason=reason
    )
