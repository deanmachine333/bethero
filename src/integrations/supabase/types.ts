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
      audit_log: {
        Row: {
          action: string
          actor: string
          created_at: string
          entity_id: string | null
          entity_type: string
          field: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          action: string
          actor?: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: []
      }
      bank_ledger: {
        Row: {
          amount: number
          created_at: string
          currency: string
          date: string
          direction: string
          from_label: string | null
          id: string
          reference: string | null
          to_label: string | null
          transfer_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          date?: string
          direction: string
          from_label?: string | null
          id?: string
          reference?: string | null
          to_label?: string | null
          transfer_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          date?: string
          direction?: string
          from_label?: string | null
          id?: string
          reference?: string | null
          to_label?: string | null
          transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_ledger_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      bets: {
        Row: {
          bookie_id: string
          clv: number | null
          created_at: string
          currency: string
          date_placed: string
          event: string
          id: string
          is_free_bet: boolean
          market: string
          notes: string | null
          odds: number
          outcome: string
          pair_id: string | null
          return: number
          stake: number
          type: string
          updated_at: string
        }
        Insert: {
          bookie_id: string
          clv?: number | null
          created_at?: string
          currency?: string
          date_placed: string
          event: string
          id?: string
          is_free_bet?: boolean
          market: string
          notes?: string | null
          odds?: number
          outcome?: string
          pair_id?: string | null
          return?: number
          stake?: number
          type?: string
          updated_at?: string
        }
        Update: {
          bookie_id?: string
          clv?: number | null
          created_at?: string
          currency?: string
          date_placed?: string
          event?: string
          id?: string
          is_free_bet?: boolean
          market?: string
          notes?: string | null
          odds?: number
          outcome?: string
          pair_id?: string | null
          return?: number
          stake?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bets_bookie_id_fkey"
            columns: ["bookie_id"]
            isOneToOne: false
            referencedRelation: "bookies"
            referencedColumns: ["id"]
          },
        ]
      }
      bookies: {
        Row: {
          country: string | null
          created_at: string
          currency: string
          id: string
          min_threshold: number
          name: string
          notes: string | null
          opening_balance: number
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          currency?: string
          id?: string
          min_threshold?: number
          name: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          currency?: string
          id?: string
          min_threshold?: number
          name?: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Relationships: []
      }
      transfers: {
        Row: {
          amount: number
          bank_cleared_date: string | null
          created_at: string
          currency: string
          deposit_date: string | null
          from_bookie_id: string | null
          id: string
          notes: string | null
          reference: string | null
          status: string
          to_bookie_id: string | null
          updated_at: string
          withdraw_date: string | null
        }
        Insert: {
          amount: number
          bank_cleared_date?: string | null
          created_at?: string
          currency?: string
          deposit_date?: string | null
          from_bookie_id?: string | null
          id?: string
          notes?: string | null
          reference?: string | null
          status?: string
          to_bookie_id?: string | null
          updated_at?: string
          withdraw_date?: string | null
        }
        Update: {
          amount?: number
          bank_cleared_date?: string | null
          created_at?: string
          currency?: string
          deposit_date?: string | null
          from_bookie_id?: string | null
          id?: string
          notes?: string | null
          reference?: string | null
          status?: string
          to_bookie_id?: string | null
          updated_at?: string
          withdraw_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_bookie_id_fkey"
            columns: ["from_bookie_id"]
            isOneToOne: false
            referencedRelation: "bookies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_bookie_id_fkey"
            columns: ["to_bookie_id"]
            isOneToOne: false
            referencedRelation: "bookies"
            referencedColumns: ["id"]
          },
        ]
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
