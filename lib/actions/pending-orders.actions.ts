'use server';

import { connectToDatabase } from '@/database/mongoose';
import PendingOrder from '@/database/models/pending-order.model';
import Wallet from '@/database/models/wallet.model';
import Position from '@/database/models/position.model';
import Notification from '@/database/models/notification.model';
import { toDecimal128, fromDecimal128, decimalMul, decimalAdd } from '@/lib/paper-trading/decimal-utils';
import mongoose from 'mongoose';
import { revalidatePath } from 'next/cache';

export async function createPendingOrder(input: {
  userId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'limit' | 'stop_loss' | 'take_profit' | 'market_on_open';
  quantity: number;
  triggerPrice: number;
  timeInForce?: 'day' | 'gtc';
  parentStrategyId?: string;
}) {
  try {
    await connectToDatabase();
    const { userId, symbol, side, orderType, quantity, triggerPrice, timeInForce = 'day', parentStrategyId } = input;
    
    const notional = decimalMul(quantity, triggerPrice);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      let parentPositionId = null;

      if (side === 'BUY') {
        // Reserve cash
        const wallet = await Wallet.findOneAndUpdate(
          { userId, cashBalance: { $gte: toDecimal128(notional) } },
          { 
            $inc: { 
              cashBalance: toDecimal128(-notional),
              reservedBalance: toDecimal128(notional)
            } 
          },
          { new: true, session }
        );

        if (!wallet) {
          await session.abortTransaction();
          return { success: false, error: 'Yetersiz bakiye. Limit emri için nakit blokesi yapılamadı.' };
        }
      } else {
        // For SELL, reserve quantity
        const position = await Position.findOne({ userId, symbol: symbol.toUpperCase(), status: 'open' }, null, { session });
        if (!position || (position.quantity - position.reservedQuantity) < quantity) {
          await session.abortTransaction();
          return { success: false, error: 'Yetersiz pozisyon. Mevcut serbest adet bu emir için yeterli değil.' };
        }
        
        await Position.updateOne(
          { _id: position._id },
          { $inc: { reservedQuantity: quantity } },
          { session }
        );
        parentPositionId = position._id;
      }

      // Calculate expiration date
      let expiresAt = null;
      if (timeInForce === 'day') {
        const d = new Date();
        d.setUTCHours(21, 0, 0, 0); // Roughly 5 PM ET
        expiresAt = d;
      }

      const newOrder = await PendingOrder.create([{
        userId,
        symbol: symbol.toUpperCase(),
        side,
        orderType,
        quantity,
        triggerPrice: toDecimal128(triggerPrice),
        reservedFunds: side === 'BUY' ? toDecimal128(notional) : toDecimal128(0),
        parentPositionId,
        parentStrategyId: parentStrategyId || null,
        timeInForce,
        expiresAt,
        status: 'active'
      }], { session });

      await session.commitTransaction();
      revalidatePath('/portfolio');
      return { success: true, order: JSON.parse(JSON.stringify(newOrder[0])) };

    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Error creating pending order:', error);
    return { success: false, error: 'Emir oluşturulurken hata oluştu.' };
  }
}

export async function cancelPendingOrder(orderId: string, userId: string) {
  try {
    await connectToDatabase();
    
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const order = await PendingOrder.findOne({ _id: orderId, userId, status: 'active' }, null, { session });
      if (!order) {
        await session.abortTransaction();
        return { success: false, error: 'Aktif emir bulunamadı.' };
      }

      // Release reservations
      if (order.side === 'BUY') {
        await Wallet.updateOne(
          { userId },
          { 
            $inc: { 
              cashBalance: order.reservedFunds,
              reservedBalance: toDecimal128(-fromDecimal128(order.reservedFunds))
            } 
          },
          { session }
        );
      } else {
        if (order.parentPositionId) {
          await Position.updateOne(
            { _id: order.parentPositionId },
            { $inc: { reservedQuantity: -order.quantity } },
            { session }
          );
        }
      }

      order.status = 'cancelled';
      await order.save({ session });

      await Notification.create([{
        userId,
        type: 'ai_job_completed',
        title: 'Emir İptal Edildi',
        message: `${order.symbol} için ${order.quantity} adetlik ${order.side} emriniz iptal edildi.`
      }], { session });

      await session.commitTransaction();
      revalidatePath('/portfolio');
      return { success: true };
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Error cancelling order:', error);
    return { success: false, error: 'Emir iptal edilirken hata oluştu.' };
  }
}

export async function getPendingOrders(userId: string) {
  try {
    await connectToDatabase();
    const orders = await PendingOrder.find({ userId }).sort({ createdAt: -1 }).lean();
    return { success: true, orders: JSON.parse(JSON.stringify(orders)) };
  } catch (e) {
    console.error('Failed to get pending orders:', e);
    return { success: false, error: 'Emirler getirilemedi.' };
  }
}

export async function cleanupDanglingOrders(positionId: string, userId: string) {
  try {
    await connectToDatabase();
    
    // Find active sell orders attached to this position
    const danglingOrders = await PendingOrder.find({ 
      parentPositionId: positionId, 
      userId, 
      status: 'active',
      side: 'SELL'
    });

    for (const order of danglingOrders) {
      // Just mark them as cancelled. The position is closed, so no reservedQuantity to release really.
      order.status = 'cancelled';
      await order.save();
    }

  } catch (error) {
    console.error('Error cleaning up dangling orders:', error);
  }
}
