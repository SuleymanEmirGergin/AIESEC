"""School level and B2B type classification logic."""

from typing import Optional


def classify_school_level(tags: dict, name: str) -> Optional[str]:
    """
    Classify school level using tags and Turkish name heuristics.

    Priority:
    1. ISCED/education tags
    2. Name-based keywords (case-insensitive, Turkish-focused)

    Returns:
    - "kindergarten", "primary_school", "middle_school", "high_school",
      "private_school", or "college_keyword"
    - None if no match
    """
    # Check if it's a kindergarten first (different amenity tag)
    if tags.get("amenity") == "kindergarten":
        return "kindergarten"

    # Not a school amenity
    if tags.get("amenity") != "school":
        return None

    # Priority 1: Use ISCED/education tags if present
    isced_level = tags.get("isced:level", "")
    school_level = tags.get("school:level", "")

    # ISCED mapping:
    # 0 = Pre-primary (kindergarten)
    # 1 = Primary
    # 2 = Lower secondary (middle school)
    # 3 = Upper secondary (high school)
    if isced_level:
        if "0" in isced_level:
            return "kindergarten"
        elif "1" in isced_level:
            return "primary_school"
        elif "2" in isced_level:
            return "middle_school"
        elif "3" in isced_level:
            return "high_school"

    if school_level:
        level_lower = school_level.lower()
        if "primary" in level_lower or "ilkokul" in level_lower:
            return "primary_school"
        elif "middle" in level_lower or "ortaokul" in level_lower:
            return "middle_school"
        elif "secondary" in level_lower or "lise" in level_lower:
            return "high_school"

    # Check for private school indicators in tags
    is_private = (
        tags.get("operator:type") == "private"
        or tags.get("school:type") == "private"
        or "özel" in tags.get("operator", "").lower()
    )

    # Priority 2: Name-based heuristics (case-insensitive, Turkish casefold)
    name_lower = (name or "").casefold()
    official_name_lower = tags.get("official_name", "").casefold()
    combined_name = f"{name_lower} {official_name_lower}"

    # Check for college keyword first (strong match for "kolej")
    college_keywords = ["kolej", "koleji", "college"]
    if any(keyword in combined_name for keyword in college_keywords) or tags.get("amenity") in ["university", "college"]:
        return "college_university"

    # Check for private school indicators
    private_keywords = ["özel", "private"]
    if is_private or any(keyword in combined_name for keyword in private_keywords):
        return "private_school"

    # School level keywords with priority order
    # Priority: primary > middle > high (if multiple matches)
    primary_keywords = ["ilkokul", "primary"]
    middle_keywords = ["ortaokul", "middle school"]
    high_keywords = [
        "lise",
        "anatolian",
        "anadolu lisesi",
        "fen lisesi",
        "mesleki",
        "meslek lisesi",
        "vocational",
        "high school",
    ]

    # Check in priority order
    if any(keyword in combined_name for keyword in primary_keywords):
        return "primary_school"
    elif any(keyword in combined_name for keyword in middle_keywords):
        return "middle_school"
    elif any(keyword in combined_name for keyword in high_keywords):
        return "high_school"

    # No classification possible - return None
    return None


def classify_b2b_type(tags: dict, element_type: str) -> Optional[str]:
    """
    Classify B2B place type (factory, office, workshop).

    Args:
        tags: OSM element tags
        element_type: OSM element type (node, way, relation)

    Returns:
        "factory", "office", "workshop", or None
    """
    # Factory indicators
    industrial_tag = tags.get("industrial")
    man_made_tag = tags.get("man_made")
    building_tag = tags.get("building")
    landuse_tag = tags.get("landuse")

    if (
        industrial_tag
        or man_made_tag == "works"
        or building_tag == "industrial"
        or landuse_tag == "industrial"
    ):
        return "factory"

    # Office indicators
    office_tag = tags.get("office")
    if office_tag or building_tag == "commercial":
        return "office"

    # Workshop indicators
    craft_tag = tags.get("craft")
    if craft_tag or industrial_tag == "workshop":
        return "workshop"

    return None


def has_name(tags: dict) -> bool:
    """Check if element has a name tag."""
    return bool(tags.get("name") or tags.get("official_name"))
