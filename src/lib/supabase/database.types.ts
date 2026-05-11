export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_calls: {
        Row: {
          api: string
          endpoint: string | null
          id: number
          status: number | null
          ts: string
        }
        Insert: {
          api: string
          endpoint?: string | null
          id?: number
          status?: number | null
          ts?: string
        }
        Update: {
          api?: string
          endpoint?: string | null
          id?: number
          status?: number | null
          ts?: string
        }
        Relationships: []
      }
      holdings: {
        Row: {
          cost_basis: number
          created_at: string
          drip_enabled: boolean
          id: string
          notes: string | null
          sector: string | null
          shares: number
          ticker: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cost_basis: number
          created_at?: string
          drip_enabled?: boolean
          id?: string
          notes?: string | null
          sector?: string | null
          shares: number
          ticker: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cost_basis?: number
          created_at?: string
          drip_enabled?: boolean
          id?: string
          notes?: string | null
          sector?: string | null
          shares?: number
          ticker?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ticker_cache: {
        Row: {
          annual_dividend: number | null
          company_name: string | null
          dividend_source: string | null
          dividend_yield: number | null
          ex_dividend_date: string | null
          fetched_at: string
          finnhub_dividend: number | null
          finnhub_yield: number | null
          fmp_dividend: number | null
          fmp_yield: number | null
          pay_frequency: number | null
          payment_date: string | null
          polygon_dividend: number | null
          polygon_ex_date: string | null
          polygon_pay_date: string | null
          polygon_validated_at: string | null
          polygon_yield: number | null
          price: number | null
          sector: string | null
          ticker: string
          yahoo_dividend: number | null
          yahoo_yield: number | null
        }
        Insert: {
          annual_dividend?: number | null
          company_name?: string | null
          dividend_source?: string | null
          dividend_yield?: number | null
          ex_dividend_date?: string | null
          fetched_at?: string
          finnhub_dividend?: number | null
          finnhub_yield?: number | null
          fmp_dividend?: number | null
          fmp_yield?: number | null
          pay_frequency?: number | null
          payment_date?: string | null
          polygon_dividend?: number | null
          polygon_ex_date?: string | null
          polygon_pay_date?: string | null
          polygon_validated_at?: string | null
          polygon_yield?: number | null
          price?: number | null
          sector?: string | null
          ticker: string
          yahoo_dividend?: number | null
          yahoo_yield?: number | null
        }
        Update: {
          annual_dividend?: number | null
          company_name?: string | null
          dividend_source?: string | null
          dividend_yield?: number | null
          ex_dividend_date?: string | null
          fetched_at?: string
          finnhub_dividend?: number | null
          finnhub_yield?: number | null
          fmp_dividend?: number | null
          fmp_yield?: number | null
          pay_frequency?: number | null
          payment_date?: string | null
          polygon_dividend?: number | null
          polygon_ex_date?: string | null
          polygon_pay_date?: string | null
          polygon_validated_at?: string | null
          polygon_yield?: number | null
          price?: number | null
          sector?: string | null
          ticker?: string
          yahoo_dividend?: number | null
          yahoo_yield?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
