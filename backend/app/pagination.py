"""Pagination response models."""

from typing import Generic, List, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginationMeta(BaseModel):
    """Pagination metadata."""

    limit: int = Field(..., description="Results per page")
    offset: int = Field(..., description="Results skipped")
    total: int = Field(..., description="Total results before pagination")
    has_more: bool = Field(..., description="Whether more results exist")


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated response wrapper."""

    results: List[T] = Field(..., description="Paginated results")
    pagination: PaginationMeta = Field(..., description="Pagination metadata")
